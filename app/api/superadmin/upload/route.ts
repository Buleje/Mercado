import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { getSupabase } from "@/lib/supabase";
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/upload
 *
 * Upload + auto-optimización inteligente para imágenes del marketplace
 * (categorías, banners platform-level). Requiere sesión platform-admin.
 *
 * Pipeline de optimización:
 *   1. Sharp redimensiona a max 800px (square crop opcional para categorías)
 *   2. Convierte a WebP quality 85 (lossless visual, -75% tamaño)
 *   3. Sube a Supabase Storage bucket `media/superadmin/{folder}/`
 *   4. Devuelve `{url, size, originalSize, savedPct}` para feedback UX
 *
 * FormData:
 *   - file: File (JPG/PNG/WebP, max 8MB)
 *   - folder: "marketplace-categories" | "banners-platform" | etc.
 *   - mode: "square" (default 800x800 cover) | "wide" (1200xAUTO) | "free"
 */

const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const BUCKET = "media";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) ?? "platform";
    const mode = (formData.get("mode") as "square" | "wide" | "free") ?? "square";

    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo no soportado: ${file.type}. Usá JPG, PNG o WebP.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: `Imagen muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 8 MB.`,
        },
        { status: 400 },
      );
    }

    const originalBuf = Buffer.from(await file.arrayBuffer());
    const originalSize = originalBuf.length;

    // ── Pipeline de optimización inteligente ──
    let pipeline = sharp(originalBuf).rotate(); // Auto-rota según EXIF
    if (mode === "square") {
      // Square crop centrado — ideal para categorías
      pipeline = pipeline.resize({
        width: 800,
        height: 800,
        fit: "cover",
        position: "center",
      });
    } else if (mode === "wide") {
      // Wide para banners — 1200 max width preservando aspect
      pipeline = pipeline.resize({
        width: 1200,
        withoutEnlargement: true,
      });
    }
    const optimized = await pipeline.webp({ quality: 85, effort: 4 }).toBuffer();

    // Path único + safe name
    const timestamp = Date.now();
    const safeName = (file.name.replace(/\.[^.]+$/, "") || "img")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    const path = `superadmin/${folder}/${timestamp}-${safeName}.webp`;

    let publicUrl: string | null = null;

    // ── Intento 1: Supabase Storage (producción) ────────────────────
    try {
      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(
        path,
        optimized,
        {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
          upsert: false,
        },
      );
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        publicUrl = urlData.publicUrl;
      } else {
        logger.warn("[superadmin/upload] supabase upload failed, falling back", {
          err: uploadError.message,
        });
      }
    } catch (e) {
      logger.warn("[superadmin/upload] supabase init failed, falling back", {
        err: e instanceof Error ? e.message : String(e),
      });
    }

    // ── Fallback: filesystem local (dev) ────────────────────────────
    // Escribe a public/uploads/{folder}/ — solo funciona en server con
    // FS escritural (local dev). En Vercel Serverless es read-only, así
    // que esta ruta NO se alcanza en prod (Supabase debería andar).
    if (!publicUrl) {
      try {
        const localDir = join(process.cwd(), "public", "uploads", folder);
        await mkdir(localDir, { recursive: true });
        const localFileName = path.replace(/^superadmin\//, "").replace(/\//g, "_");
        const localPath = join(localDir, localFileName);
        await writeFile(localPath, optimized);
        publicUrl = `/uploads/${folder}/${localFileName}`;
      } catch (e) {
        logger.error("[superadmin/upload] local fallback failed", {
          err: e instanceof Error ? e.message : String(e),
        });
        return NextResponse.json(
          {
            error:
              "No pudimos guardar la imagen. Si estás en local, verificá permisos. Si en prod, configurá Supabase Storage.",
          },
          { status: 500 },
        );
      }
    }

    const savedPct = Math.round(((originalSize - optimized.length) / originalSize) * 100);

    return NextResponse.json({
      url: publicUrl,
      path,
      size: optimized.length,
      originalSize,
      savedPct,
      mimeType: "image/webp",
    });
  } catch (e) {
    logger.error("[superadmin/upload] unexpected", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
