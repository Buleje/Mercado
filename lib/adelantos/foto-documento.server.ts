import "server-only";

/**
 * Foto del DNI de una persona de Adelantos (ADR-525, Ley 29733: dato personal
 * sensible). Se guarda en el bucket PRIVADO `forestal-privado` —el mismo de las
 * hojas firmadas y los vouchers (`lib/adelantos/firma-storage.ts`), que nace y
 * se mantiene `public: false` y sólo admite WebP— en su propia carpeta
 * `<tenantId>/adelantos-personas/<beneficiarioId>/`. No hay URL pública: el
 * binario lo sirve `GET /api/adelantos/beneficiarios/[id]/foto-documento` tras
 * chequear sesión, permiso de adelantos y negocio.
 *
 * La imagen es lo que sharp dice que ES, no lo que declara el navegador: se
 * rehace en WebP sin metadatos (sin el GPS ni el modelo de la cámara), girada
 * según su orientación y achicada a 1600 px, que alcanza para leer el DNI.
 */
import sharp from "sharp";

/** Lo que acepta la ruta (el archivo, antes de achicarlo). */
export const MAX_BYTES_FOTO_DOCUMENTO = 8 * 1024 * 1024;
/** El pedido entero: el archivo + el sobre del multipart. Más → 413 antes de leer. */
export const MAX_BYTES_PEDIDO_FOTO_DOCUMENTO = MAX_BYTES_FOTO_DOCUMENTO + 256 * 1024;
/** Un celular de 48 MP entra; una bomba de descompresión (PNG chico que se abre en gigas) no. */
const MAX_PIXELES = 50_000_000;
const LADO_MAX = 1600;

/** El `type` que manda el navegador: sólo un primer filtro (vacío = el navegador no lo reconoce, p. ej. HEIC en Windows). */
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", ""]);
const FORMATOS = new Set(["jpeg", "png", "webp", "heif"]);

export type FotoDocumento = { webp: Buffer; ancho: number; alto: number };
export type ErrorFotoDocumento = { error: string; status: 413 | 422; code: "no_es_imagen" | "muy_grande" | "heic_no_soportado" };

export function esErrorFotoDocumento(r: FotoDocumento | ErrorFotoDocumento): r is ErrorFotoDocumento {
  return "error" in r;
}

const NO_ES: ErrorFotoDocumento = {
  error: "La foto del documento tiene que ser una imagen (JPG, PNG, WebP o HEIC).",
  status: 422,
  code: "no_es_imagen",
};
/* El sharp que se instala con npm lee HEIF sólo en AV1 (AVIF): el HEIC del
   iPhone viene en HEVC y no se puede abrir acá. Se dice claro en vez de un
   «no es una imagen» que confunde a quien sí mandó una foto. */
const HEIC: ErrorFotoDocumento = {
  error: "La foto está en HEIC (iPhone) y no se pudo abrir. Mándala como JPG: en el iPhone, Ajustes › Cámara › Formatos › «Más compatible».",
  status: 422,
  code: "heic_no_soportado",
};

/** `ftypheic`/`ftypheix`/`ftypmif1`… en el byte 4: es un HEIF por contenido. */
function pareceHeif(buf: Buffer): boolean {
  return buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp" && /^(hei[cxms]|hev[cxms]|mif1|msf1)$/.test(buf.subarray(8, 12).toString("latin1"));
}

export async function normalizarFotoDocumento(file: File): Promise<FotoDocumento | ErrorFotoDocumento> {
  if (!TIPOS.has(file.type)) return NO_ES;
  if (file.size > MAX_BYTES_FOTO_DOCUMENTO) return { error: "La foto del documento pesa más de 8 MB.", status: 413, code: "muy_grande" };
  const buf = Buffer.from(await file.arrayBuffer());
  /* `warning` es lo más estricto de sharp: un JPEG cortado o corrupto → 422. */
  const opciones = { limitInputPixels: MAX_PIXELES, failOn: "warning" } as const;
  try {
    const meta = await sharp(buf, opciones).metadata();
    if (!meta.format || !FORMATOS.has(meta.format)) return pareceHeif(buf) ? HEIC : NO_ES;
    if (meta.format === "heif" && meta.compression !== "av1") return HEIC;
    const { data, info } = await sharp(buf, opciones)
      .rotate()
      .resize({ width: LADO_MAX, height: LADO_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { webp: data, ancho: info.width, alto: info.height };
  } catch {
    return pareceHeif(buf) ? HEIC : { ...NO_ES, error: "La foto del documento no es una imagen que se pueda leer." };
  }
}

// ── Ruta en el bucket privado ────────────────────────────────────────────────
const CARPETA = "adelantos-personas";
/** Ids de la base (cuid, o `main`): sin `/`, `.` ni `%`, así no arman otra carpeta. */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;
const ARCHIVO = /^\d{10,16}-dni-[a-f0-9]{16,32}\.webp$/;

/**
 * `<tenantId>/adelantos-personas/<beneficiarioId>/<ms>-dni-<azar>.webp`. Fuera
 * de `<tenantId>/adelantos/` a propósito: el borrado de las hojas de un
 * adelanto lista esa carpeta y no tiene por qué ver el DNI de nadie.
 */
export function rutaFotoDocumento(tenantId: string, beneficiarioId: string, ms: number, azar: string): string {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(beneficiarioId)) throw new Error("id inválido para la ruta de la foto del documento");
  const az = azar.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (az.length < 16) throw new Error("azar corto para la ruta de la foto del documento");
  return `${tenantId}/${CARPETA}/${beneficiarioId}/${Math.trunc(ms)}-dni-${az}.webp`;
}

/** Sólo una foto de la carpeta de ESTA persona de ESTE negocio, un tramo, sin nada raro. */
export function esRutaFotoDocumento(ruta: string, tenantId: string, beneficiarioId: string): boolean {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(beneficiarioId)) return false;
  const base = `${tenantId}/${CARPETA}/${beneficiarioId}/`;
  return ruta.startsWith(base) && ARCHIVO.test(ruta.slice(base.length));
}
