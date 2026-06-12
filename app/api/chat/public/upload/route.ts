import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * POST /api/chat/public/upload — Tanda 4 · Comprobante/foto en el hilo
 * (Brandon 2026-06-11).
 *
 * El cliente sube una imagen (típicamente la captura del Yape/Plin) para
 * adjuntarla al chat. Devuelve `{ url }` y el cliente manda un mensaje con
 * attachmentUrl + messageType "image". Reusa el patrón hardenado de
 * reviews/upload: público, rate-limited, sharp re-encodea (mata payloads no-img).
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "media";
const MAX_WIDTH = 1280;

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("marketplace-chat-public")) {
    return NextResponse.json({ error: "Chat no disponible" }, { status: 503 });
  }
  const rl = await applyRateLimit(req, "STRICT", "chat-public-upload");
  if (rl) return rl;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se envió archivo" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo no permitido: ${file.type}. Usa JPG, PNG o WebP.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 5 MB.` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // sharp re-encodea → si no es imagen real, tira y caemos al catch (no se
    // sube nada). Resize + webp para pesar poco en el hilo.
    let optimized: Buffer;
    try {
      optimized = await sharp(buffer)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "No pudimos procesar la imagen" }, { status: 400 });
    }

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const path = `chat/${timestamp}-${randomSuffix}.webp`;

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, optimized, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      upsert: false,
    });

    if (uploadError) {
      logger.error("[chat-upload] Supabase Storage error", { err: uploadError.message, path });
      return NextResponse.json({ error: "Error al subir imagen" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e) {
    logger.error("[chat-upload] Unexpected error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno al procesar imagen" }, { status: 500 });
  }
}
