import "server-only";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { subirFotoCarga } from "@/lib/forestal/fotos-carga-storage";
import {
  pathDeFotoDeInspeccion,
  tenantIdSchema,
  urlDeFotoDeInspeccion,
} from "@/lib/superadmin/plantas-forestales/schemas";

/**
 * POST /api/superadmin/plantas/<planta>/inspecciones/fotos — multipart `file`.
 *
 * La foto de un hallazgo (security 17-10). Antes subía por el `/upload` genérico
 * al bucket PÚBLICO `media`: la pila de madera, la cara del encargado y el
 * equipo de otro negocio se veían sin sesión con sólo tener el enlace. Ahora va
 * al bucket privado de las fotos de carga (ADR-434) con un nombre que no se
 * adivina, y se ve sólo con sesión de superadmin por `…/fotos/<uuid>` (302 a una
 * URL firmada de 10 min). Devuelve `{ url }` = esa dirección relativa, que es
 * lo único que el hallazgo acepta guardar.
 *
 * La planta tiene que existir (404 si no): la foto queda en SU carpeta y la DB
 * class rechaza guardar en una inspección una foto de otra planta.
 */
/* Vercel corta el pedido entero en 4,5 MB con un 413 sin JSON: con 4 MB el tope
   lo dice este endpoint. El celular ya achica lo que pasa de 1,5 MB. */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PEDIDO = MAX_BYTES + 64 * 1024;
/* Una imagen chica en bytes puede declarar 30 000 × 30 000 píxeles. */
const MAX_PIXELES = 50_000_000;
const MAX_LADO = 1600;
const TIPOS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
/* Lo que sharp dice que ES el archivo, no lo que declara el navegador. */
const FORMATOS = new Set(["jpeg", "png", "webp"]);
const NO_ES_PLANTA = { error: "Planta no encontrada" } as const;
const MUY_GRANDE = { error: "La foto pesa más de 4 MB: sácala con menos resolución." } as const;

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenantId: string }> }) {
  const limitado = applyRateLimit(req, "DRIVE", "superadmin:plantas:inspecciones:fotos");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const tid = tenantIdSchema.safeParse((await ctx.params).tenantId);
  if (!tid.success) return NextResponse.json(NO_ES_PLANTA, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PEDIDO) {
    return NextResponse.json(MUY_GRANDE, { status: 413 });
  }

  try {
    const planta = await PlantasForestalesDB.obtener(tid.data);
    if (!planta) return NextResponse.json(NO_ES_PLANTA, { status: 404 });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "No llegó la foto. Vuelve a tomarla." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No llegó la foto. Vuelve a tomarla." }, { status: 400 });
    }
    if (!TIPOS.has(file.type)) {
      return NextResponse.json({ error: "Esa imagen no se puede subir: usa una foto JPG, PNG o WebP." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) return NextResponse.json(MUY_GRANDE, { status: 413 });

    let webp: Buffer;
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const { format } = await sharp(buf, { limitInputPixels: MAX_PIXELES }).metadata();
      if (!format || !FORMATOS.has(format)) {
        return NextResponse.json({ error: "El archivo no es una foto JPG, PNG ni WebP." }, { status: 400 });
      }
      /* `rotate()` endereza por EXIF antes de que el WebP tire los metadatos (el
         EXIF del teléfono trae el GPS: no viaja con la foto). */
      webp = await sharp(buf, { limitInputPixels: MAX_PIXELES })
        .rotate()
        .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (e) {
      logger.warn("[superadmin/plantas/inspecciones/fotos] sharp no pudo leer la imagen", {
        err: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json({ error: "El archivo no es una imagen que se pueda leer." }, { status: 400 });
    }

    const id = randomUUID();
    const subida = await subirFotoCarga(pathDeFotoDeInspeccion(planta.tenantId, id), webp);
    if (!subida.ok) {
      return NextResponse.json({ error: "No se pudo guardar la foto. Prueba de nuevo." }, { status: 502 });
    }
    return NextResponse.json(
      { url: urlDeFotoDeInspeccion(planta.tenantId, id), size: webp.length },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("[superadmin/plantas/inspecciones/fotos] POST", { tenantId: tid.data, error: String(err) });
    return NextResponse.json({ error: "No se pudo subir la foto" }, { status: 500 });
  }
}
