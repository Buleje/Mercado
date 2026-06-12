import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * POST /api/chat/public/upload-audio — Tanda 4 · Notas de voz (Brandon
 * 2026-06-11).
 *
 * Recibe el audio grabado con MediaRecorder (webm/mp4/mpeg) y lo guarda tal
 * cual en media/chat-audio. Devuelve `{ url }`; el cliente manda un mensaje con
 * metadataJson.voice. Público + rate-limited (igual que el upload de imagen).
 *
 * NO re-encodea (a diferencia de las imágenes): validamos type + tamaño +
 * magic bytes básicos y subimos el blob original.
 */

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB (~2-3 min de voz)
const ALLOWED = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"];
const BUCKET = "media";

function extFor(type: string): string {
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("marketplace-chat-public")) {
    return NextResponse.json({ error: "Chat no disponible" }, { status: 503 });
  }
  const rl = await applyRateLimit(req, "STRICT", "chat-public-upload-audio");
  if (rl) return rl;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se envió audio" }, { status: 400 });
    }
    // El type del Blob de MediaRecorder a veces trae codecs: audio/webm;codecs=opus
    const baseType = file.type.split(";")[0].trim();
    if (!ALLOWED.includes(baseType)) {
      return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Audio muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 8 MB.` },
        { status: 400 },
      );
    }
    if (file.size < 256) {
      return NextResponse.json({ error: "Audio vacío" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const path = `chat-audio/${timestamp}-${randomSuffix}.${extFor(baseType)}`;

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: baseType,
      cacheControl: "public, max-age=31536000, immutable",
      upsert: false,
    });

    if (uploadError) {
      logger.error("[chat-audio] Supabase Storage error", { err: uploadError.message, path });
      return NextResponse.json({ error: "Error al subir audio" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e) {
    logger.error("[chat-audio] Unexpected error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno al procesar audio" }, { status: 500 });
  }
}
