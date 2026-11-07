/**
 * A dónde lleva un resultado del buscador del panel (⌘K, `components/admin/GlobalSearch.tsx`).
 *
 * «Todo nombre de una cosa lleva a su ficha» (Brandon, 09-10): elegir «Arroz
 * Costeño» en ⌘K abre SU ficha, no la lista de productos donde había que
 * volver a buscarlo. El destino sale de la misma tabla que los demás
 * hipervínculos (`lib/admin/enlaces-panel.ts`): si esa cosa todavía no abre
 * su ficha por enlace, el resultado lleva a su módulo (lo que ya hacía).
 *
 * Hasta el 09-10, además, los productos, clientes y pedidos de ⌘K no hacían
 * NADA al elegirlos: `/api/search` manda `tab` y el buscador sólo navegaba con
 * `navigateTo` (que traen los módulos, no los resultados de la API).
 */

import { hrefDe, hrefDeDestino, type CosaDelPanel } from "@/lib/admin/enlaces-panel";

/** Lo que el destino necesita de un resultado (de `/api/search` o del índice local). */
export interface ResultadoBuscable {
  /** `/api/search` lo arma como `<tipo>-<id>`: `producto-12`, `cliente-982000111`, `pedido-345`. */
  id: string;
  type: string;
  /** Módulo de la cosa (lo manda `/api/search`). */
  tab?: string;
  /** Módulo destino de un resultado local (módulos, sub-vistas). Gana sobre `tab`. */
  navigateTo?: string;
  vista?: string;
  sub?: string;
}

/** Tipo de resultado → cosa del panel. El id que pide la tabla: el teléfono para un cliente. */
const COSA_DEL_TIPO: Readonly<Record<string, CosaDelPanel>> = {
  producto: "producto",
  cliente: "cliente",
  pedido: "pedido",
  proveedor: "proveedor",
};

export interface DestinoDelResultado {
  /** Ruta del panel (`/admin?tab=…`): para el `href` y para navegar sin recargar. */
  href: string;
  /** `true` = abre la ficha de esa cosa; `false` = sólo su módulo. */
  abreFicha: boolean;
  tab: string;
}

/** El id de la cosa dentro del id del resultado (`producto-12` → `12`). `null` si no viene. */
export function idDeLaCosa(r: Pick<ResultadoBuscable, "id" | "type">): string | null {
  const prefijo = `${r.type}-`;
  if (!r.id.startsWith(prefijo)) return null;
  const id = r.id.slice(prefijo.length).trim();
  /* Un cliente sin teléfono llega como `cliente-undefined`. */
  return id && id !== "undefined" && id !== "null" ? id : null;
}

/**
 * La ficha de la cosa si ya abre por enlace; si no, su módulo (con su vista y
 * sub-vista). `null` = el resultado no lleva a ningún lado (una acción con su
 * propio callback).
 */
export function destinoDelResultado(r: ResultadoBuscable): DestinoDelResultado | null {
  const cosa = COSA_DEL_TIPO[r.type];
  if (cosa) {
    const ficha = hrefDe(cosa, idDeLaCosa(r));
    if (ficha) {
      const tab = new URLSearchParams(ficha.split("?")[1] ?? "").get("tab") ?? r.tab ?? "";
      return { href: ficha, abreFicha: true, tab };
    }
  }
  const tab = r.navigateTo ?? r.tab;
  if (!tab) return null;
  const params: Record<string, string> = {};
  if (r.vista) params.vista = r.vista;
  if (r.sub) params.sub = r.sub;
  return { href: hrefDeDestino({ tab, params }), abreFicha: false, tab };
}
