import "server-only";

/**
 * Lo que «Adjuntar archivo» de Adelantos acepta (10-10, Ley 29733): una FOTO o
 * un PDF del comprobante. Se decide por el CONTENIDO, no por el `type` ni el
 * nombre que manda el navegador:
 *
 *  - empieza con `%PDF-1.`/`%PDF-2.` y cierra con `%%EOF` → PDF, tal cual,
 *    salvo que traiga contenido activo (JavaScript, lanzar programas, acciones
 *    automáticas, archivos incrustados), también dentro de los streams
 *    comprimidos, o que no se pueda revisar (cifrado, filtros raros, bomba
 *    zip): ese se rechaza, la puerta lo serviría desde nuestro origen;
 *  - si no, la foto pasa por `normalizarImagen` (sharp lee lo que ES, la
 *    rehace en WebP sin metadatos; un ejecutable con nombre `.jpg` → 422).
 */
import { inflateSync } from "node:zlib";
import { esErrorImagen, normalizarImagen, type ErrorImagen } from "@/lib/adelantos/imagen-firma.server";
import type { ExtensionPrivada } from "@/lib/adelantos/recibo-firmado";

/** 4 MB: el bucket admite 5 y un voucher o un PDF del banco pesa mucho menos. */
export const MAX_BYTES_ADJUNTO = 4 * 1024 * 1024;
const MAX_PIXELES = 24_000_000;

export type AdjuntoNormalizado = { ext: ExtensionPrivada; cuerpo: Buffer };

export function esErrorAdjunto(r: AdjuntoNormalizado | ErrorImagen): r is ErrorImagen {
  return "error" in r;
}

const CABECERA_PDF = /^%PDF-[12]\.\d/;
/**
 * Nombres de PDF con contenido activo o que salen solos del documento
 * (revisión de `security` 10-10). `#xx` se decodifica antes (`/J#61vaScript`).
 * `/URI` suelto NO: es el enlace que el usuario cliquea (los PDF del banco los
 * traen); el automático entra por `/OpenAction` con acción o `/AA`, que sí se
 * rechazan.
 */
const PDF_ACTIVO =
  /\/(JavaScript|JS|AA|Launch|GoToR|GoToE|Rendition|Sound|Movie|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData)(?![A-Za-z0-9])/;
/** `/OpenAction` con una acción (diccionario o referencia); el arreglo `[3 0 R /Fit]` es sólo «abrir en la página 1». */
const ABRE_CON_ACCION = /\/OpenAction\s*(<<|\d+\s+\d+\s+R)/;
/** Filtros que se descomprimen y se revisan. */
const FLATE = new Set(["FlateDecode", "Fl"]);
/** Imágenes: los datos no son sintaxis de PDF; el visor no los lee como objetos. */
const FILTROS_IMAGEN = new Set(["DCTDecode", "DCT", "JPXDecode", "CCITTFaxDecode", "CCF", "JBIG2Decode"]);
/** Tope de bytes DESCOMPRIMIDOS en todo el PDF: una bomba zip de 4 MB se abre en gigas. */
export const MAX_BYTES_PDF_ABIERTO = 32 * 1024 * 1024;
/** El pedido entero (archivo + multipart): 4 MB de archivo + margen. Más → 413 antes de leer. */
export const MAX_BYTES_PEDIDO_ADJUNTO = 4.5 * 1024 * 1024;

const sinEscapes = (t: string) => t.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

export function esPdfPorContenido(buf: Buffer): boolean {
  return CABECERA_PDF.test(buf.subarray(0, 16).toString("latin1"));
}

type Revision = { ok: true; textos: string[] } | { ok: false; motivo: "filtro" | "bomba" | "ilegible" };

/**
 * Cada `stream` del PDF: los `/FlateDecode` se descomprimen (con tope total)
 * para revisar lo que esconden — un `/JS` dentro de un ObjStm comprimido no se
 * ve en los bytes crudos. Otro filtro que pueda esconder sintaxis (ASCIIHex,
 * ASCII85, LZW, RunLength o uno desconocido) → no se puede revisar → rechazo.
 */
function streamsAbiertos(buf: Buffer, texto: string): Revision {
  const textos: string[] = [];
  let restante = MAX_BYTES_PDF_ABIERTO;
  const inicio = /(?<!end)stream(?:\r\n|\n)/g;
  for (let m = inicio.exec(texto); m; m = inicio.exec(texto)) {
    const desde = m.index + m[0].length;
    const hasta = texto.indexOf("endstream", desde);
    if (hasta < 0) return { ok: false, motivo: "ilegible" };
    /* El diccionario del objeto: desde su `N G obj` hasta el `stream`. */
    const cabeza = texto.lastIndexOf("obj", m.index);
    const dic = sinEscapes(texto.slice(cabeza < 0 ? Math.max(0, m.index - 4096) : cabeza, m.index));
    const filtro = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dic);
    const nombres = filtro ? (filtro[1].match(/\/[A-Za-z0-9]+/g) ?? []).map((n) => n.slice(1)) : [];
    inicio.lastIndex = hasta + "endstream".length;
    if (nombres.length === 0) continue; // sin comprimir: ya está en el texto crudo
    if (nombres.every((n) => FILTROS_IMAGEN.has(n))) continue;
    if (!FLATE.has(nombres[0]) || nombres.slice(1).some((n) => !FILTROS_IMAGEN.has(n))) return { ok: false, motivo: "filtro" };
    try {
      const abierto = inflateSync(buf.subarray(desde, hasta), { maxOutputLength: Math.max(1, restante) });
      restante -= abierto.length;
      if (restante <= 0) return { ok: false, motivo: "bomba" };
      textos.push(abierto.toString("latin1"));
    } catch (e) {
      const code = (e as { code?: string }).code;
      return { ok: false, motivo: code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError ? "bomba" : "ilegible" };
    }
  }
  return { ok: true, textos };
}

/** `null` = el PDF sirve; si no, por qué no. */
export function rechazoDePdf(buf: Buffer, nombre = "El archivo"): ErrorImagen | null {
  if (buf.length > MAX_BYTES_ADJUNTO) return { error: `${nombre} pesa más de 4 MB.`, status: 413, code: "muy_grande" };
  const no = (error: string): ErrorImagen => ({ error, status: 422, code: "no_es_imagen" });
  if (!esPdfPorContenido(buf)) return no(`${nombre} no es un PDF que se pueda leer.`);
  if (!buf.subarray(Math.max(0, buf.length - 1024)).toString("latin1").includes("%%EOF")) {
    return no(`${nombre} está cortado (el PDF no termina). Vuelve a descargarlo.`);
  }
  const crudo = buf.toString("latin1");
  const plano = sinEscapes(crudo);
  /* Cifrado: los streams no se pueden revisar. */
  if (/\/Encrypt(?![A-Za-z0-9])/.test(plano)) return no(`${nombre} está protegido con clave. Mándalo como foto o imprímelo a PDF sin clave.`);
  const revision = streamsAbiertos(buf, crudo);
  if (!revision.ok) {
    return no(
      revision.motivo === "bomba"
        ? `${nombre} se abre demasiado grande para revisarlo. Mándalo como foto.`
        : `${nombre} usa un formato interno que no se puede revisar. Mándalo como foto o imprímelo a PDF.`,
    );
  }
  for (const t of [plano, ...revision.textos.map(sinEscapes)]) {
    if (PDF_ACTIVO.test(t) || ABRE_CON_ACCION.test(t)) {
      return no(`${nombre} trae contenido activo (programas, acciones automáticas o archivos dentro). Guárdalo como foto o imprímelo a PDF.`);
    }
  }
  return null;
}

export async function normalizarAdjunto(file: File, nombre = "El comprobante"): Promise<AdjuntoNormalizado | ErrorImagen> {
  if (file.size > MAX_BYTES_ADJUNTO) return { error: `${nombre} pesa más de 4 MB.`, status: 413, code: "muy_grande" };
  const buf = Buffer.from(await file.arrayBuffer());
  if (esPdfPorContenido(buf)) {
    const rechazo = rechazoDePdf(buf, nombre);
    return rechazo ?? { ext: "pdf", cuerpo: buf };
  }
  /* La foto: `normalizarImagen` exige además un tipo de imagen declarado. Se le
     pasa el File rehecho con los mismos bytes: el tipo declarado no decide, lo
     decide sharp. */
  const comoImagen = new File([new Uint8Array(buf)], "comprobante", { type: "image/jpeg" });
  const imagen = await normalizarImagen(comoImagen, { maxBytes: MAX_BYTES_ADJUNTO, maxPixeles: MAX_PIXELES, ancho: 1600, nombre });
  if (esErrorImagen(imagen)) {
    return imagen.code === "no_es_imagen" ? { ...imagen, error: `${nombre} tiene que ser una foto (JPG, PNG, WebP) o un PDF.` } : imagen;
  }
  return { ext: "webp", cuerpo: imagen.webp };
}
