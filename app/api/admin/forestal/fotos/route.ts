import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CARPETA_CARGA, urlPrivada, type FotoCarga } from "@/lib/forestal/fotos-carga";
import { subirFotoCarga } from "@/lib/forestal/fotos-carga-storage";
import { PROPOSITOS_FOTO, firmarFoto } from "@/lib/forestal/fotos-carga-firma";

/**
 * POST /api/admin/forestal/fotos — sube UNA foto de la carga al bucket PRIVADO.
 *
 * multipart: `file` + opcionales `tomadaEn` (ISO), `lat`, `lng`, `precisionM`,
 * `sellada` ("true"/"1"). Responde `{ foto: FotoCarga }` con `url = "priv:…"`,
 * y `subidaEn`/`por` puestos ACÁ (desde el reloj del servidor y la sesión), no
 * desde lo que diga el cliente.
 *
 * Por qué no `/api/upload`: exige `["admin"]` —el almacenero, que es quien está
 * al pie del camión, no podía subir— y escribe en el bucket PÚBLICO con un
 * nombre adivinable. Esto guarda la foto sólo, sin tocar el libro: la lista de
 * la guía la persiste después el PATCH `fotos_guia`.
 *
 * Guard: requireAdmin → CSRF → rate limit (DRIVE: una guía son hasta 10 fotos
 * seguidas) → `spec:forestal:ctp-libro`.
 *
 * La respuesta trae `foto.firma` (HMAC del servidor sobre todos sus datos,
 * `fotos-carga-firma.ts`): la guía sólo acepta una foto nueva si la firma
 * coincide, así que lo que se declara acá —hora, lugar, sello— no se puede
 * cambiar en el navegador antes de guardarla.
 */

/* 4 MB y no más: Vercel corta el PEDIDO entero en 4,5 MB (foto + campos del
   formulario) con un 413 propio, sin JSON — el operario veía «error» sin saber
   por qué. Con 4 MB el tope lo dice este endpoint, con su mensaje. */
const MAX_BYTES = 4 * 1024 * 1024;
/* Una imagen chica en bytes puede declarar 30 000 × 30 000 píxeles y reventar
   la memoria al decodificarla. 50 Mpx cubre de sobra cualquier teléfono (108 Mpx
   ya llegan reducidas por el cliente). */
const MAX_PIXELES = 50_000_000;
/* Lo que sharp dice que ES el archivo, no lo que declara el navegador. */
const FORMATOS = new Set(["jpeg", "png", "webp"]);
const MAX_LADO = 1600;
/* SVG fuera (sirve scripts). HEIC lo convierte el cliente antes de subir. */
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

const vacioANull = (v: unknown) => (v === "" || v == null ? null : v);
const metaSchema = z.object({
  tomadaEn: z.preprocess(vacioANull, z.string().trim().max(40).pipe(z.iso.datetime({ offset: true })).nullable()),
  lat: z.preprocess(vacioANull, z.coerce.number().min(-90).max(90).nullable()),
  lng: z.preprocess(vacioANull, z.coerce.number().min(-180).max(180).nullable()),
  precisionM: z.preprocess(vacioANull, z.coerce.number().min(0).max(100_000).nullable()),
  sellada: z.preprocess((v) => v === "true" || v === "1" || v === true, z.boolean()),
  /* Para qué es la foto: va dentro de la firma, así una foto de la carga no
     vale como comprobante de un pago (revisión 2026-09-26). Sin el campo, carga. */
  proposito: z.preprocess(vacioANull, z.enum(PROPOSITOS_FOTO).nullable()),
});

export const POST = withApiHandler("forestal-fotos-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "DRIVE", "forestal-fotos");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El Libro CTP no está habilitado para esta tienda." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Manda la foto como multipart/form-data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "sin_archivo", message: "No llegó ninguna foto." }, { status: 400 });
  }
  if (!TIPOS.has(file.type)) {
    return NextResponse.json(
      { error: "tipo_no_permitido", message: `Tipo no permitido: ${file.type || "desconocido"}. Usa JPG, PNG o WebP.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: "muy_grande",
        message: `La foto pesa ${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB. El máximo es 4 MB: sácala con menos resolución o recórtala.`,
      },
      { status: 413 },
    );
  }

  const meta = metaSchema.safeParse({
    tomadaEn: form.get("tomadaEn"),
    lat: form.get("lat"),
    lng: form.get("lng"),
    precisionM: form.get("precisionM"),
    sellada: form.get("sellada"),
    proposito: form.get("proposito"),
  });
  if (!meta.success) {
    return NextResponse.json({ error: "invalid_body", issues: meta.error.issues }, { status: 400 });
  }

  let webp: Buffer;
  try {
    /* `rotate()` endereza por EXIF antes de que el webp tire los metadatos
       (el EXIF del teléfono trae GPS: no viaja con la imagen, viaja en `lat/lng`
       sólo si el operario lo mandó). */
    const buf = Buffer.from(await file.arrayBuffer());
    const { format } = await sharp(buf, { limitInputPixels: MAX_PIXELES }).metadata();
    if (!format || !FORMATOS.has(format)) {
      return NextResponse.json(
        { error: "tipo_no_permitido", message: `El archivo no es JPG, PNG ni WebP (es ${format ?? "desconocido"}).` },
        { status: 400 },
      );
    }
    webp = await sharp(buf, { limitInputPixels: MAX_PIXELES })
      .rotate()
      .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    logger.warn("[forestal-fotos] sharp no pudo leer la imagen", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "imagen_invalida", message: "El archivo no es una imagen que se pueda leer." }, { status: 400 });
  }

  const path = `${auth.tenantId}/${CARPETA_CARGA}/${randomUUID()}.webp`;
  const r = await subirFotoCarga(path, webp);
  if (!r.ok) {
    return NextResponse.json({ error: "upload_failed", message: "No se pudo guardar la foto. Prueba de nuevo." }, { status: 502 });
  }

  const m = meta.data;
  const foto: FotoCarga = firmarFoto({
    url: urlPrivada(path),
    tomadaEn: m.tomadaEn,
    subidaEn: new Date().toISOString(),
    por: auth.username ?? null,
    lat: m.lat,
    lng: m.lng,
    precisionM: m.precisionM,
    sellada: m.sellada,
  }, m.proposito ?? "carga");
  return NextResponse.json({ foto, size: webp.length });
});
