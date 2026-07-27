/**
 * Versión del dibujo de las miniaturas del drive.
 *
 * La miniatura se cachea una hora en el navegador, así que un arreglo del
 * renderer no se ve hasta que ese caché vence. Subir este número invalida las
 * viejas al instante, sin pedirle a nadie que refresque con Ctrl+Shift+R.
 *
 * Historial:
 *   1 — primera versión (PDF, planilla y documento).
 *   2 — se registra una fuente real en el canvas; antes, sin fuente en el
 *       sistema, cada letra se dibujaba como un cuadradito vacío.
 *
 * Client-safe a propósito: lo usan la grilla y el visor.
 */
export const VERSION_MINIATURA = 2;

/** URL de la miniatura de un documento, ya versionada. */
export function urlMiniatura(docId: string): string {
  return `/api/admin/documents/${docId}/thumbnail?r=${VERSION_MINIATURA}`;
}
