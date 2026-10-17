/**
 * Qué ES un archivo — client-safe, sin depender de que el navegador lo sepa.
 *
 * El navegador rellena `File.type` con una tabla corta y vieja: una foto HEIC
 * del iPhone, una planilla de LibreOffice o un plano DWG llegan como
 * `application/octet-stream` o directamente vacío. Guardar eso significa que
 * después el drive no puede ni mostrar el ícono correcto ni previsualizar.
 *
 * Acá se resuelve el tipo por EXTENSIÓN cuando el navegador no ayuda, y se
 * clasifica en familias para la UI. No valida nada: eso es `upload-limits.ts`.
 */

import { extensionDe } from "./upload-limits";

export { extensionDe };

/**
 * Extensión → MIME. No pretende ser exhaustiva: cubre lo que de verdad llega a
 * la bodega (Office, LibreOffice, fotos de celular, comprimidos, planos,
 * correos) y todo lo que el navegador suele dejar en blanco.
 */
const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  // ── Office ────────────────────────────────────────────────────────────
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dot: "application/msword",
  docm: "application/vnd.ms-word.document.macroenabled.12",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroenabled.12",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pps: "application/vnd.ms-powerpoint",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  pub: "application/x-mspublisher",
  vsd: "application/vnd.visio",
  vsdx: "application/vnd.ms-visio.drawing",
  mdb: "application/vnd.ms-access",
  accdb: "application/vnd.ms-access",
  // ── LibreOffice / OpenDocument ────────────────────────────────────────
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  odg: "application/vnd.oasis.opendocument.graphics",
  odf: "application/vnd.oasis.opendocument.formula",
  // ── Texto y datos ─────────────────────────────────────────────────────
  txt: "text/plain",
  rtf: "application/rtf",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  md: "text/markdown",
  json: "application/json",
  xml: "application/xml",
  yml: "text/yaml",
  yaml: "text/yaml",
  log: "text/plain",
  ini: "text/plain",
  epub: "application/epub+zip",
  // ── Imágenes (incluye lo que el navegador NO conoce) ──────────────────
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  eps: "application/postscript",
  raw: "image/x-dcraw",
  cr2: "image/x-canon-cr2",
  nef: "image/x-nikon-nef",
  dng: "image/x-adobe-dng",
  // ── Comprimidos ───────────────────────────────────────────────────────
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  tgz: "application/gzip",
  bz2: "application/x-bzip2",
  // ── Audio y video ─────────────────────────────────────────────────────
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
  amr: "audio/amr",
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  webm: "video/webm",
  "3gp": "video/3gpp",
  wmv: "video/x-ms-wmv",
  // ── Correo y varios de oficina ────────────────────────────────────────
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  vcf: "text/vcard",
  ics: "text/calendar",
  // ── Planos y diseño ───────────────────────────────────────────────────
  dwg: "image/vnd.dwg",
  dxf: "image/vnd.dxf",
  kml: "application/vnd.google-earth.kml+xml",
  kmz: "application/vnd.google-earth.kmz",
  shp: "application/octet-stream",
  cdr: "application/vnd.corel-draw",
};

/** El MIME que le corresponde a esa extensión, o null si no la conocemos. */
export function mimeDeExtension(nombre: string): string | null {
  return MIME_POR_EXTENSION[extensionDe(nombre)] ?? null;
}

/**
 * El tipo REAL con el que guardar el archivo.
 *
 * Se prefiere la extensión cuando el navegador no dijo nada útil
 * (`octet-stream` es su forma de encogerse de hombros). Si el navegador sí
 * reconoció el archivo, se le cree: sabe más que una tabla.
 */
export function resolverMime(nombre: string, mimeDelNavegador?: string | null): string {
  const m = (mimeDelNavegador ?? "").trim().toLowerCase();
  if (m && m !== "application/octet-stream" && m !== "application/x-download") return m;
  return mimeDeExtension(nombre) || m || "application/octet-stream";
}

export type FamiliaArchivo =
  | "imagen" | "pdf" | "planilla" | "texto" | "presentacion"
  | "comprimido" | "audio" | "video" | "correo" | "plano" | "otro";

/** En qué cajón cae el archivo, para el ícono y el filtro de la UI. */
export function familiaDe(nombre: string, mime?: string | null): FamiliaArchivo {
  const m = resolverMime(nombre, mime).toLowerCase();
  const ext = extensionDe(nombre);

  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return ext === "dwg" || ext === "dxf" ? "plano" : "imagen";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("message/") || m.includes("outlook")) return "correo";
  if (/sheet|excel|csv|tab-separated|opendocument\.spreadsheet/.test(m)) return "planilla";
  if (/presentation|powerpoint|opendocument\.presentation/.test(m)) return "presentacion";
  if (/zip|rar|7z|tar|gzip|bzip2/.test(m)) return "comprimido";
  if (/word|opendocument\.text|rtf|^text\/|json|xml|yaml|epub/.test(m)) return "texto";
  if (/dwg|dxf|kml|corel|postscript|visio/.test(m)) return "plano";
  return "otro";
}

const ETIQUETA: Record<FamiliaArchivo, string> = {
  imagen: "Imagen",
  pdf: "PDF",
  planilla: "Hoja de cálculo",
  texto: "Documento",
  presentacion: "Presentación",
  comprimido: "Comprimido",
  audio: "Audio",
  video: "Video",
  correo: "Correo",
  plano: "Plano / diseño",
  otro: "Archivo",
};

/** "Hoja de cálculo · XLSX" — lo que se muestra debajo del nombre. */
export function etiquetaTipo(nombre: string, mime?: string | null): string {
  const fam = familiaDe(nombre, mime);
  const ext = extensionDe(nombre);
  return ext ? `${ETIQUETA[fam]} · ${ext.toUpperCase()}` : ETIQUETA[fam];
}

/**
 * Imágenes que el navegador NO dibuja pero el servidor sí puede convertir a
 * PNG (`/preview-image`). El SVG entra acá aunque el navegador lo dibuje: tal
 * cual ejecuta scripts, rasterizado no.
 */
const CONVERTIBLES = new Set(["heic", "heif", "tif", "tiff", "svg", "avif"]);

export function esImagenConvertible(nombre: string, mime?: string | null): boolean {
  const m = resolverMime(nombre, mime).toLowerCase();
  return CONVERTIBLES.has(extensionDe(nombre))
    || ["image/heic", "image/heif", "image/tiff", "image/svg+xml", "image/avif"].includes(m);
}

/** ¿El navegador puede dibujarla en un `<img>`? (HEIC y TIFF no, por ejemplo.) */
export function esImagenRenderizable(nombre: string, mime?: string | null): boolean {
  const m = resolverMime(nombre, mime).toLowerCase();
  return ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon"].includes(m);
}
