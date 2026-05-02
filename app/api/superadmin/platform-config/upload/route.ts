import "server-only";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/platform-config/upload  (multipart/form-data)
 *
 * Sube una imagen (logo, favicon, QR de Yape/Plin, OG image) al bucket
 * media/. Devuelve la URL pública para que el form la guarde en
 * PlatformSetting via PATCH /api/superadmin/platform-config.
 *
 * Auth: middleware ya validó la cookie buleje-platform-sess.
 *
 * Field `kind`: identifica el tipo para naming + dimensiones óptimas.
 */
const KindSchema = z.enum(["logo", "favicon", "yapeQr", "plinQr", "ogImage"]);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_SIZE = 4 * 1024 * 1024; // 4 MB
const BUCKET = "media";

const KIND_CONFIG: Record<z.infer<typeof KindSchema>, { width: number; height?: number }> = {
  logo: { width: 600 },
  favicon: { width: 128, height: 128 },
  yapeQr: { width: 600 },
  plinQr: { width: 600 },
  ogImage: { width: 1200, height: 630 },
};

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const kindRaw = formData.get("kind");
  const kindParsed = KindSchema.safeParse(kindRaw);
  if (!kindParsed.success) {
    return NextResponse.json({ error: "Tipo de imagen no especificado" }, { status: 400 });
  }
  const kind = kindParsed.data;

  if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Archivo muy grande (máx 4 MB)" }, { status: 400 });
  }

  // SVG: lo subimos sin sharp (preserva vectores).
  let bytes: Buffer;
  let contentType = "image/webp";
  let extension = "webp";

  if (file.type === "image/svg+xml") {
    bytes = Buffer.from(await file.arrayBuffer());
    contentType = "image/svg+xml";
    extension = "svg";
  } else {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const cfg = KIND_CONFIG[kind];
      bytes = await sharp(buf)
        .rotate()
        .resize({ width: cfg.width, height: cfg.height, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer();
    } catch (err) {
      logger.error("[platform-config/upload] sharp failed", { error: String(err) });
      return NextResponse.json({ error: "No pudimos procesar la imagen" }, { status: 500 });
    }
  }

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `platform/${kind}-${ts}-${rand}.${extension}`;

  try {
    const supabase = getSupabase();
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) {
      logger.error("[platform-config/upload] supabase failed", { error: upErr.message });
      return NextResponse.json({ error: "Error subiendo la imagen" }, { status: 500 });
    }
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    logger.error("[platform-config/upload] threw", { error: String(err) });
    return NextResponse.json({ error: "Error subiendo la imagen" }, { status: 500 });
  }
}
