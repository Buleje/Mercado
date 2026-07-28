/**
 * analyzable-mime — qué tipos de documento puede LEER la IA (extraer texto y
 * describir). Single-source client-safe: lo usan el análisis server-side
 * (analyze-document.ts) y los botones "Indexar" del drive.
 *
 * Las IMÁGENES sí entran: el modelo de visión que ya usa el escáner de cámara
 * (llama-4-scout vía Groq) lee una foto de documento igual que un PDF, así que
 * una boleta fotografiada también recibe nombre, descripción y vencimiento.
 * Los formatos que el modelo no acepta (HEIC, TIFF) quedan afuera a propósito:
 * el drive los convierte para VERLOS, pero la URL firmada que recibe la IA
 * apunta al original.
 */
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Formatos de imagen que el modelo de visión acepta tal cual. */
const IMAGENES_CON_VISION = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

/** ¿Es una imagen que la IA puede MIRAR (no leer como texto)? */
export function esImagenAnalizable(mimeType: string): boolean {
  return IMAGENES_CON_VISION.has(mimeType.toLowerCase());
}

export function isAnalyzableMime(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("text/")
    || mimeType === DOCX_MIME || mimeType === XLSX_MIME
    || esImagenAnalizable(mimeType);
}
