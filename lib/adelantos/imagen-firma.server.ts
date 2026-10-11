import "server-only";
/**
 * ADR-491: leer el multipart de una firma y pasar cada imagen a WebP sin
 * metadatos ANTES de escribir nada. Salió de `PATCH /api/adelantos/[id]`
 * (`adjuntarComprobante`, 08-10) para que lo usen también Entregar, el registro
 * de firmas, el enlace público y el voucher privado.
 *
 * La imagen es lo que sharp dice que ES, no lo que declara el navegador. WebP
 * sin EXIF (saca GPS y modelo de la cámara de la foto de la huella) y girada
 * según la orientación de la foto antes de perderla.
 */
import sharp from "sharp";

import { MAX_BYTES_FIRMA, MAX_BYTES_HUELLA } from "@/lib/adelantos/entregar-tipos";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

/** La firma sale del `LienzoFirma` (PNG de ~1000 px): 4 MP sobra. */
export const LIMITES_FIRMA = { maxBytes: MAX_BYTES_FIRMA, maxPixeles: 4_000_000, ancho: 1000, nombre: "La firma" } as const;
/** La huella: foto del celular que el cliente ya comprimió a ≤1600 px. */
export const LIMITES_HUELLA = { maxBytes: MAX_BYTES_HUELLA, maxPixeles: 12_000_000, ancho: 1200, nombre: "La foto de la huella" } as const;
const FORMATOS = new Set(["jpeg", "png", "webp"]);

export type ImagenNormalizada = { webp: Buffer; ancho: number; alto: number };
export type ErrorImagen = { error: string; status: 413 | 422; code: "no_es_imagen" | "muy_grande" };

export function esErrorImagen(r: ImagenNormalizada | ErrorImagen): r is ErrorImagen {
  return "error" in r;
}

/**
 * @param maxPixeles corta antes una bomba de descompresión (un PNG chico que se
 *   abre en 40 MP de RAM).
 * @param nombre cómo se llama la imagen en el mensaje («La hoja firmada», «La huella»).
 */
export async function normalizarImagen(
  file: File,
  { maxBytes, maxPixeles, ancho, nombre = "La imagen", calidad = 85 }: { maxBytes: number; maxPixeles: number; ancho: number; nombre?: string; calidad?: number },
): Promise<ImagenNormalizada | ErrorImagen> {
  const noEs: ErrorImagen = { error: `${nombre} tiene que ser una imagen (JPG, PNG o WebP).`, status: 422, code: "no_es_imagen" };
  if (!TIPOS.has(file.type)) return noEs;
  if (file.size > maxBytes) {
    const mb = Math.round((maxBytes / 1024 / 1024) * 10) / 10;
    return { error: `${nombre} pesa más de ${mb} MB.`, status: 413, code: "muy_grande" };
  }
  /* `warning` es lo más estricto de sharp (`none` < `truncated` < `error` <
     `warning`) y su valor por defecto en 0.34: explícito para que un cambio de
     versión no lo afloje. Un JPEG cortado o con datos corruptos → 422. */
  const opciones = { limitInputPixels: maxPixeles, failOn: "warning" } as const;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { format } = await sharp(buf, opciones).metadata();
    if (!format || !FORMATOS.has(format)) return noEs;
    const { data, info } = await sharp(buf, opciones)
      .rotate()
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: calidad })
      .toBuffer({ resolveWithObject: true });
    return { webp: data, ancho: info.width, alto: info.height };
  } catch {
    return { error: `${nombre} no es una imagen que se pueda leer.`, status: 422, code: "no_es_imagen" };
  }
}

export type MultipartLeido = { ok: true; textos: Record<string, string>; archivos: Record<string, File> };
export type MultipartRechazado = { ok: false; status: 400; error: string; issues?: string[] };

/**
 * El lector estricto de `adjuntarComprobante`: cada campo una vez, sólo los
 * esperados (archivo donde va archivo, texto donde va texto). Un campo repetido
 * o inesperado → 400: así un segundo `firma` no se cuela detrás del primero.
 */
export async function leerMultipartFirma(
  req: Request,
  campos: { archivos: readonly string[]; textos: readonly string[] },
): Promise<MultipartLeido | MultipartRechazado> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, status: 400, error: "Manda los datos como multipart/form-data." };
  }
  const textos: Record<string, string> = {};
  const archivos: Record<string, File> = {};
  for (const [k, v] of form.entries()) {
    if (campos.archivos.includes(k) && v instanceof File && !(k in archivos)) archivos[k] = v;
    else if (campos.textos.includes(k) && typeof v === "string" && !(k in textos)) textos[k] = v;
    else return { ok: false, status: 400, error: "Datos inválidos", issues: [`Campo repetido o inesperado: ${k}`] };
  }
  return { ok: true, textos, archivos };
}

/** `datos` es JSON dentro del multipart; `undefined` si no vino o no se puede leer. */
export function jsonDe(texto: string | undefined): unknown {
  if (texto == null) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

/**
 * La firma y la huella del multipart (`firma`, `huella`), ya en WebP. El primer
 * error corta: nada se escribió todavía.
 */
export async function imagenesDeFirma(archivos: Record<string, File>): Promise<{ firma: Buffer | null; huella: Buffer | null } | ErrorImagen> {
  let firma: Buffer | null = null;
  let huella: Buffer | null = null;
  if (archivos.firma) {
    const r = await normalizarImagen(archivos.firma, LIMITES_FIRMA);
    if (esErrorImagen(r)) return r;
    firma = r.webp;
  }
  if (archivos.huella) {
    const r = await normalizarImagen(archivos.huella, LIMITES_HUELLA);
    if (esErrorImagen(r)) return r;
    huella = r.webp;
  }
  return { firma, huella };
}
