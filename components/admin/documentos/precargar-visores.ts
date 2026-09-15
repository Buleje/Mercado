import type { FamiliaArchivo } from "@/lib/documents/tipos-archivo";

/**
 * Trae por adelantado el visor que va a hacer falta.
 *
 * Los visores entran por `import()` porque arrastran librerías pesadas (exceljs
 * para las planillas, jszip para Word y las presentaciones). Eso está bien para
 * el peso de la página, pero significa que el chunk recién empieza a bajar
 * cuando ya hiciste clic — y hasta entonces la vista previa está en blanco.
 *
 * Pasar el mouse por una tarjeta es una intención bastante clara de abrirla, y
 * es gratis: si al final no la abre, el navegador se queda con un chunk que
 * igual iba a necesitar en algún momento. Los `import()` se deduplican solos,
 * así que llamar esto muchas veces no descarga nada dos veces.
 */
export function precargarVisor(familia: FamiliaArchivo): void {
  if (typeof window === "undefined") return;
  try {
    if (familia === "planilla") { void import("./HojaPreview"); return; }
    if (familia === "texto") { void import("./TextoPreview"); return; }
    if (familia === "presentacion") { void import("./PresentacionPreview"); return; }
  } catch {
    // Precargar es una mejora, nunca un requisito: si falla, el visor se carga
    // igual al abrir el documento.
  }
}
