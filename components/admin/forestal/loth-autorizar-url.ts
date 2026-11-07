/**
 * «Cargar lo autorizado» desde la tabla «Cupo por especie»: el enlace que lleva
 * al Plan de manejo con la carga de especies abierta y ESA especie elegida.
 *
 *   ?tab=loth-libro-operaciones&vista=plan&autorizar=<especie>
 *
 * Quien lee `autorizar` es la vista del plan (`useAutorizarDesdeUrl`), no la
 * tabla del cupo: acá sólo se arma la dirección y se navega. La tabla vive
 * DENTRO del libro, así que navegar es `pushState` + un `popstate` (la receta
 * de `loth-mapa-tala-url`): `useVistaModulo` relee la URL y pasa a «plan» sin
 * recargar el panel, y el «atrás» vuelve al cupo.
 */

import { LOTH_TAB_ID } from "./loth-mapa-tala-url";

export const PARAM_AUTORIZAR = "autorizar";

/** La dirección de la carga de lo autorizado, con la especie elegida. */
export function urlCargarAutorizado(especie: string, pathname = "/admin"): string {
  const q = new URLSearchParams({ tab: LOTH_TAB_ID, vista: "plan", [PARAM_AUTORIZAR]: especie.trim() });
  return `${pathname}?${q.toString()}`;
}

/** Ir a cargar lo autorizado de esa especie sin recargar el panel. */
export function irACargarAutorizado(especie: string): void {
  const destino = urlCargarAutorizado(especie, window.location.pathname);
  const yaEnElLibro = new URLSearchParams(window.location.search).get("tab") === LOTH_TAB_ID;
  if (yaEnElLibro) {
    window.history.pushState(null, "", destino);
  } else {
    // Desde otro módulo: el panel navega primero y después se escribe el
    // parámetro propio, que `navigateTab` borraría.
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: LOTH_TAB_ID, vista: "plan" } }));
    window.history.replaceState(null, "", destino);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Lee el pedido de la URL y lo BORRA (con `replace`): si no, cerrar el modal y
 * recargar la página lo volvería a abrir.
 */
export function tomarPedidoAutorizar(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const especie = url.searchParams.get(PARAM_AUTORIZAR)?.trim() ?? "";
  if (!especie) return null;
  url.searchParams.delete(PARAM_AUTORIZAR);
  window.history.replaceState(null, "", url.toString());
  return especie;
}
