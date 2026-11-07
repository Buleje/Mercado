/**
 * Lee el archivo que eligió el dueño (el .xml de la factura electrónica o el
 * .zip que bajó de SUNAT o le llegó por correo) y devuelve el XML como texto,
 * listo para `POST /api/purchases/desde-xml` (`{ xml }`). Puro: bytes → texto.
 *
 * - .zip: toma el primer .xml que NO sea la constancia de SUNAT (CDR, `R-…`).
 * - Codificación: muchos XML de SUNAT vienen en ISO-8859-1; se mira el
 *   `encoding=` de la cabecera. Si dice UTF-8 y los bytes no lo son, se lee
 *   como ISO-8859-1 (hay emisores que lo declaran mal).
 */
import { unzipSync } from "fflate";

/** Lo mismo que acepta el endpoint (`TOPE_BYTES_XML`). */
export const TOPE_XML_BYTES = 2 * 1024 * 1024;
export const TOPE_ARCHIVO_BYTES = 10 * 1024 * 1024;

export type Codificacion = "utf-8" | "iso-8859-1";
export type LecturaArchivoXml =
  | { ok: true; xml: string; nombre: string; codificacion: Codificacion }
  | { ok: false; error: string };

const LATIN1 = /^(?:iso[-_]?8859[-_]?1|latin[-_]?1|l1|windows[-_]?1252|cp1252)$/i;
const RAIZ_CDR = /<(?:[\w-]+:)?ApplicationResponse[\s>]/;

export function esZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** La codificación que declara `<?xml … encoding="…"?>` (sin cabecera = UTF-8). */
export function codificacionDeclarada(bytes: Uint8Array): Codificacion {
  let cabecera = "";
  for (let i = 0; i < Math.min(bytes.length, 256); i++) cabecera += String.fromCharCode(bytes[i]);
  const m = /<\?xml[^>]*?encoding\s*=\s*["']([^"']+)["']/i.exec(cabecera);
  return m && LATIN1.test(m[1].trim()) ? "iso-8859-1" : "utf-8";
}

export function decodificarXml(bytes: Uint8Array): { texto: string; codificacion: Codificacion } {
  if (codificacionDeclarada(bytes) === "utf-8") {
    try {
      return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes), codificacion: "utf-8" };
    } catch {
      // Dijo UTF-8 y no lo es: casi siempre es ISO-8859-1 mal declarado.
    }
  }
  return { texto: new TextDecoder("iso-8859-1").decode(bytes), codificacion: "iso-8859-1" };
}

const baseDe = (ruta: string): string => ruta.split("/").pop() ?? ruta;

/** La constancia de recepción de SUNAT (CDR): su archivo empieza con `R-`. */
export function esCdr(ruta: string): boolean {
  return /^r-/i.test(baseDe(ruta));
}

export function xmlDelZip(archivos: Record<string, Uint8Array>): { nombre: string; bytes: Uint8Array } | { error: string } {
  const xmls = Object.keys(archivos).filter((r) => /\.xml$/i.test(r) && !r.startsWith("__MACOSX/") && !baseDe(r).startsWith("."));
  const factura = xmls.find((r) => !esCdr(r));
  if (factura) return { nombre: baseDe(factura), bytes: archivos[factura] };
  return {
    error: xmls.length > 0
      ? "El .zip solo trae la constancia de SUNAT (el archivo que empieza con R-), no la factura. Pídele a tu proveedor el XML de la factura."
      : "El .zip no trae ningún archivo .xml. Elige el .zip de la factura electrónica.",
  };
}

export function leerArchivoXml(nombre: string, bytes: Uint8Array): LecturaArchivoXml {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío. Elige otro." };
  if (bytes.length > TOPE_ARCHIVO_BYTES) return { ok: false, error: "El archivo pesa más de 10 MB; una factura electrónica pesa mucho menos." };
  let xmlBytes = bytes;
  let nombreXml = nombre;
  if (esZip(bytes)) {
    let archivos: Record<string, Uint8Array>;
    try {
      // Sólo se descomprimen los .xml chicos: un .zip armado para inflarse no tumba la pestaña.
      archivos = unzipSync(bytes, { filter: (f) => /\.xml$/i.test(f.name) && f.originalSize <= TOPE_XML_BYTES });
    } catch {
      return { ok: false, error: "No se pudo abrir el .zip. Descárgalo de nuevo del correo o de SUNAT." };
    }
    const elegido = xmlDelZip(archivos);
    if ("error" in elegido) return { ok: false, error: elegido.error };
    xmlBytes = elegido.bytes;
    nombreXml = elegido.nombre;
  }
  if (xmlBytes.length > TOPE_XML_BYTES) return { ok: false, error: "El XML pesa más de 2 MB; una factura electrónica pesa mucho menos." };
  const { texto, codificacion } = decodificarXml(xmlBytes);
  const xml = texto.trimStart();
  if (!xml.startsWith("<")) {
    return { ok: false, error: "Ese archivo no es una factura electrónica. Elige el .xml o el .zip que te mandó tu proveedor." };
  }
  if (RAIZ_CDR.test(xml.slice(0, 4000))) {
    return { ok: false, error: "Esa es la constancia de SUNAT (el archivo que empieza con R-), no la factura. Elige el otro archivo." };
  }
  return { ok: true, xml, nombre: nombreXml, codificacion };
}

export async function leerArchivoElegido(archivo: File): Promise<LecturaArchivoXml> {
  if (archivo.size > TOPE_ARCHIVO_BYTES) return { ok: false, error: "El archivo pesa más de 10 MB; una factura electrónica pesa mucho menos." };
  return leerArchivoXml(archivo.name, new Uint8Array(await archivo.arrayBuffer()));
}
