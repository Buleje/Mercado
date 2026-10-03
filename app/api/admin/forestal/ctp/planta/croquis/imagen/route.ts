import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { ForestPlantaCroquisDB } from "@/lib/db/forest-planta-croquis.db";
import { firmarImagenCroquis, subirImagenCroquis } from "@/lib/forestal/croquis-storage";
import { esPathImagenCroquis, pathImagenCroquis } from "@/lib/forestal/planta-croquis-guardado";

/**
 * /api/admin/forestal/ctp/planta/croquis/imagen — la imagen de fondo del croquis (ADR-465).
 *
 * GET  → 302 a una URL firmada de 10 min de la imagen ACTUAL del croquis de
 *        este negocio (sin parámetro de ruta: no hay path que adivinar ni que
 *        recorrer). Sin croquis o sin imagen → 404. Es lo que trae
 *        `croquis.imagenUrl` (con `?v=` para que cambie al subir otra).
 * POST multipart `file` (JPG/PNG/WebP ≤ 4 MB) → { ok, imagenRef, ancho, alto }
 *        Sube al bucket PRIVADO y NO toca el croquis: la pantalla manda después
 *        `PUT croquis { imagenRef }` junto con las medidas (mismo patrón que las
 *        fotos de la carga: subir, después guardar). `ancho/alto` en píxeles
 *        sirven para avisar si la proporción no es la del terreno.
 *
 * POST: admin/owner (cambia el plano). GET: quien ve el plano.
 */

/* 4 MB: Vercel corta el pedido entero en 4,5 MB con un 413 propio sin JSON. */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PIXELES = 60_000_000;
/* Un plano necesita detalle (números de la leyenda, rieles): más que una foto. */
const MAX_LADO = 3200;
const FORMATOS = new Set(["jpeg", "png", "webp"]);
/* SVG fuera (sirve scripts). */
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

async function guard(req: NextRequest, roles: ("admin" | "almacenero" | "owner")[]) {
  const auth = await requireAdmin(req, roles);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado." }, { status: 403 });
  }
  return auth;
}

export const GET = withApiHandler("forestal-ctp-planta-croquis-imagen-get", async (req: NextRequest) => {
  const auth = await guard(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "DRIVE_READ", "forestal-croquis-ver");
  if (rl) return rl;

  const croquis = await ForestPlantaCroquisDB.get(auth.tenantId);
  const path = croquis?.imagenPath ?? null;
  // Doble llave: aunque el KV dijera otra cosa, sólo se firma una ruta de ESTE negocio.
  if (!path || !esPathImagenCroquis(path, auth.tenantId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const firmada = await firmarImagenCroquis(path);
  if (!firmada) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(null, {
    status: 302,
    headers: { Location: firmada, "Cache-Control": "private, max-age=300", "Referrer-Policy": "no-referrer" },
  });
});

export const POST = withApiHandler("forestal-ctp-planta-croquis-imagen-post", async (req: NextRequest) => {
  const auth = await guard(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "DRIVE", "forestal-croquis");
  if (rl) return rl;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Manda la imagen como multipart/form-data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "sin_archivo", message: "No llegó ninguna imagen." }, { status: 400 });
  if (!TIPOS.has(file.type)) {
    return NextResponse.json({ error: "tipo_no_permitido", message: `Tipo no permitido: ${file.type || "desconocido"}. Usa JPG, PNG o WebP.` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "muy_grande", message: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB. El máximo es 4 MB.` },
      { status: 413 },
    );
  }

  let webp: Buffer;
  let ancho = 0;
  let alto = 0;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { format } = await sharp(buf, { limitInputPixels: MAX_PIXELES }).metadata();
    if (!format || !FORMATOS.has(format)) {
      return NextResponse.json({ error: "tipo_no_permitido", message: `El archivo no es JPG, PNG ni WebP (es ${format ?? "desconocido"}).` }, { status: 400 });
    }
    const { data, info } = await sharp(buf, { limitInputPixels: MAX_PIXELES })
      .rotate()
      .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    webp = data;
    ancho = info.width;
    alto = info.height;
  } catch (e) {
    logger.warn("[croquis] sharp no pudo leer la imagen", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "imagen_invalida", message: "El archivo no es una imagen que se pueda leer." }, { status: 400 });
  }

  const path = pathImagenCroquis(auth.tenantId, randomUUID());
  const r = await subirImagenCroquis(path, webp);
  if (!r.ok) return NextResponse.json({ error: "upload_failed", message: "No se pudo guardar la imagen. Prueba de nuevo." }, { status: 502 });
  return NextResponse.json({ ok: true, imagenRef: path, ancho, alto, bytes: webp.length });
});
