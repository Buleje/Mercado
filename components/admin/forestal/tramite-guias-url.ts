/**
 * «Usar en un formato» desde la vista GTF del Libro TH o desde «Guías
 * emitidas» del Libro CTP: el enlace que lleva a Trámites y Oficios con el
 * formato elegido y las guías tildadas.
 *
 *   ?tab=forestal-tramites&formato=<id>&guias=<id1>,ctp:<id2>
 *
 * Cada id dice de qué libro es: `ctp:<id>` = despacho del Libro CTP;
 * `loth:<id>` o el id SIN prefijo = GTF del Libro TH. El del Libro TH se
 * escribe sin prefijo a propósito: así eran las URLs antes de que el CTP
 * eligiera guías (07-10) y las ya generadas tienen que seguir abriendo lo mismo.
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
  /** Tal como vienen en la URL (con su prefijo de libro, si lo traen). */
  ids: string[];
}

/** El libro del que sale una guía elegida. */
export type LibroGuia = "loth" | "ctp";

const PREFIJO: Record<LibroGuia, string> = { loth: "loth:", ctp: "ctp:" };

/** El id como viaja en `?guias=`: el del Libro TH sin prefijo (compatible con las URLs de antes). */
export function refGuia(libro: LibroGuia, id: string): string {
  return libro === "loth" ? id : `${PREFIJO[libro]}${id}`;
}

/** De qué libro es un id de la URL y cuál es el id pelado (`null` si viene vacío). */
export function leerRefGuia(ref: string): { libro: LibroGuia; id: string } | null {
  const t = ref.trim();
  for (const libro of ["ctp", "loth"] as const) {
    if (t.startsWith(PREFIJO[libro])) {
      const id = t.slice(PREFIJO[libro].length).trim();
      return id ? { libro, id } : null;
    }
  }
  return t ? { libro: "loth", id: t } : null;
}

/** Los ids de la URL repartidos por libro: cada libro se pide por su lado. Sin repetir. */
export function idsPorLibro(refs: readonly string[]): Record<LibroGuia, string[]> {
  const out: Record<LibroGuia, Set<string>> = { loth: new Set(), ctp: new Set() };
  for (const r of refs) {
    const ref = leerRefGuia(r);
    if (ref) out[ref.libro].add(ref.id);
  }
  return { loth: [...out.loth], ctp: [...out.ctp] };
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
