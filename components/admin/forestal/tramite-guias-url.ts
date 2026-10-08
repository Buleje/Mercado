/**
 * «Usar en un formato» desde la vista GTF del Libro TH: el enlace que lleva a
 * Trámites y Oficios con el formato elegido y las guías tildadas.
 *
 *   ?tab=forestal-tramites&formato=<id>&guias=<id1>,<id2>
 *
 * Mismo patrón que `loth-autorizar-url`: el panel navega primero (un
 * `navigateTab` borraría los parámetros ajenos) y después se escriben los
 * propios. Quien los lee es `useTramiteDesdeGuias`, al montar Trámites, y los
 * BORRA: recargar la página no vuelve a abrir el formato encima de lo tipeado.
 */

export const TRAMITES_TAB_ID = "forestal-tramites";
const PARAM_FORMATO = "formato";
const PARAM_GUIAS = "guias";

export interface PedidoGuias {
  formatoId: string;
  ids: string[];
}

/** La dirección del trámite con sus guías (para enlazar o probar). */
export function urlTramiteConGuias(formatoId: string, ids: readonly string[], pathname = "/admin"): string {
  const q = new URLSearchParams({ tab: TRAMITES_TAB_ID, [PARAM_FORMATO]: formatoId, [PARAM_GUIAS]: ids.join(",") });
  return `${pathname}?${q.toString()}`;
}

/** Ir a Trámites con el formato abierto y las guías cargadas, sin recargar el panel. */
export function irATramiteConGuias(formatoId: string, ids: readonly string[]): void {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: TRAMITES_TAB_ID } }));
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM_FORMATO, formatoId);
  url.searchParams.set(PARAM_GUIAS, ids.join(","));
  window.history.replaceState(null, "", url.toString());
}

/** Lee el pedido de la URL SIN tocarla (puro: sirve de inicializador de estado). */
export function leerPedidoGuias(): PedidoGuias | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const formatoId = q.get(PARAM_FORMATO)?.trim() ?? "";
  const ids = (q.get(PARAM_GUIAS) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return formatoId && ids.length > 0 ? { formatoId, ids } : null;
}

/** Borra el pedido de la URL (con `replace`, sin entrada nueva en el historial). */
export function borrarPedidoGuias(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM_FORMATO) && !url.searchParams.has(PARAM_GUIAS)) return;
  url.searchParams.delete(PARAM_FORMATO);
  url.searchParams.delete(PARAM_GUIAS);
  window.history.replaceState(null, "", url.toString());
}
