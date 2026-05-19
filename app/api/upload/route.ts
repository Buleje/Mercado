import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import sharp from "sharp";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
// SECURITY 2026-05-06 (audit storefront H02): SVG removido del allowlist.
// SVG sirve scripts inline; al servirse con `Content-Type: image/svg+xml`
// desde el bucket público de Supabase, abrir la URL directamente ejecuta
// JS arbitrario (XSS stored). Mantener solo formatos raster.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const BUCKET = "media";
const MAX_WIDTH = 1200;
// [SECURITY] Allowlist contra path traversal — admin malicioso o XSS
// no puede escribir cross-tenant con folder="../otro-tenant".
const ALLOWED_FOLDERS = new Set([
  "products", "logos", "brand", "branding", "general",
  "image-bank", "media", "covers", "banners", "superadmin",
  "hero",
]);

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "upload"); if (_rl) return _rl;
  // Solo admins pueden subir imágenes
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    // [SECURITY] Sanitizar folder + allowlist. Bloquea path traversal (../, ..\\)
    // y cualquier char fuera de [a-zA-Z0-9_-]. Si el folder no está en la
    // allowlist, fallback a "general" (no rechazo para no romper UX).
    const rawFolder = (formData.get("folder") as string) ?? "general";
    const sanitized = rawFolder.replace(/[^a-zA-Z0-9_-]/g, "");
    const folder = ALLOWED_FOLDERS.has(sanitized) ? sanitized : "general";

    if (!file) {
      return NextResponse.json({ error: "No se envió archivo" }, { status: 400 });
    }

    // Validar tipo (SVG bloqueado por XSS — ver comentario allowlist)
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return NextResponse.json(
        { error: `Tipo no permitido: ${file.type}. Usa JPG, PNG o WebP.` },
        { status: 400 },
      );
    }

    // Validar tamaño
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 5 MB.` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = "image/webp";
    const ext = "webp";

    // Optimizar con sharp: redimensionar + convertir a webp.
    // Allowlist bloquea SVG arriba — siempre raster aquí.
    const optimized = await sharp(buffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    // Generar nombre único
    const timestamp = Date.now();
    const safeName = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 50);
    const tenantId = auth.tenantId;
    const path = `${tenantId}/${folder}/${timestamp}-${safeName}.${ext}`;

    // Subir a Supabase Storage con service_role (bypasea RLS — la auth
    // ya la validó requireAdmin más arriba).
    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000, immutable",
        upsert: false,
      });

    if (uploadError) {
      logger.error("[upload] Supabase Storage error", { err: uploadError.message, path });
      return NextResponse.json(
        { error: `Error al subir: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path,
      size: optimized.length,
      mimeType,
      originalName: file.name,
    });
  } catch (e) {
    logger.error("[upload] Unexpected error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno al procesar imagen" }, { status: 500 });
  }
}
