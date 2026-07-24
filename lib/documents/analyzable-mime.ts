/**
 * analyzable-mime — qué tipos de documento puede LEER la IA (extraer texto y
 * describir). Single-source client-safe: lo usan el análisis server-side
 * (analyze-document.ts) y los botones "Indexar" del drive.
 *
 * Las IMÁGENES no están: el proveedor de IA activo no tiene visión (gap
 * conocido); las fotos se describen recién cuando haya un modelo multimodal.
 */
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isAnalyzableMime(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("text/")
    || mimeType === DOCX_MIME || mimeType === XLSX_MIME;
}
