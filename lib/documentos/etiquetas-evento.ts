/**
 * Abrir «Etiquetas con QR» desde cualquier parte del Archivo (barra de selección, aviso de
 * «Por registrar», panel) sin pasar estado entre hooks: un evento de ventana que escucha la
 * ventana de etiquetas montada en ModalesArchivo (31-10, Brandon).
 */
export const EVENTO_ETIQUETAS = "documentos:etiquetas";

export interface DetalleEtiquetas {
  /** Los papeles a imprimir (los que no tienen código se saltan). */
  ids: string[];
}

export function abrirEtiquetas(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  window.dispatchEvent(new CustomEvent<DetalleEtiquetas>(EVENTO_ETIQUETAS, { detail: { ids } }));
}
