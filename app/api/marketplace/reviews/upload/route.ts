import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB per photo
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "media";
const MAX_WIDTH = 800;

/**
 * POST /api/marketplace/reviews/upload
 * Endpoint público para subir fotos de reseñas (sin auth).
 * Rate-limited para evitar abuso.
 */
export async function POST(req: NextRequest) {
  // Rate limit: strict — 10 uploads per minute per IP
  const rl = await applyRateLimit(req, "STRICT", "review-upload");
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
        { error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 2 MB.` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Optimize: resize + convert to webp
    const optimized = await sharp(buffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();

    // Generate unique name under reviews folder
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const path = `reviews/${timestamp}-${randomSuffix}.webp`;

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
        upsert: false,
      });

    if (uploadError) {
      logger.error("[review-upload] Supabase Storage error", { err: uploadError.message, path });
      return NextResponse.json(
        { error: "Error al subir imagen" },
        { status: 500 },
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e) {
    logger.error("[review-upload] Unexpected error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno al procesar imagen" }, { status: 500 });
  }
}
