/**
 * Clases compartidas del Kárdex del permiso. Viven aparte de los componentes:
 * un módulo de componente que además exporta constantes corta el Fast Refresh.
 */

import type { MovimientoKardex } from "@/lib/forestal/loth-kardex";

export const TH =
  "px-3 py-2.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] whitespace-nowrap";
export const TD = "px-3 py-2 align-top max-sm:text-left!";
/**
 * En el celular la columna fija lleva fecha, movimiento y especie, y estas dos
 * columnas se esconden: así las cifras quedan al lado y no al final del scroll.
 * Con `!`: `hoja-grilla` fuerza `display: table-cell` en las celdas.
 */
export const SOLO_ESCRITORIO = "max-sm:hidden!";
export const NUM =
  "px-2.5 py-2 text-right align-top font-mono tabular-nums whitespace-nowrap max-sm:text-right!";

export const TONO_MOV: Record<MovimientoKardex, string> = {
  tala: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  trozado:
    "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
  despacho:
    "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  consumo:
    "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  producto: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  despacho_producto:
    "border-[var(--data-error-500)] bg-[var(--surface-sunken)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};
/** La primera columna queda fija al hacer scroll a lo ancho (400 px, o la ventana de 958 px): opaca para tapar lo que pasa por debajo. */
export const FIJA = "sticky left-0 z-[1] border-r border-[var(--rule-soft)]";
/** `hoja-grilla` devuelve thead y tbody a tabla en el celular, no el pie: sin esto el cierre era una tarjeta suelta. */
export const PIE_COMO_TABLA =
  "max-sm:[&_tfoot]:table-footer-group! max-sm:[&_tfoot_tr]:table-row! max-sm:[&_tfoot_td]:table-cell! max-sm:[&_tfoot_td]:before:hidden! max-sm:[&_tfoot_td]:w-auto! max-sm:[&_tfoot_td]:px-2! max-sm:[&_tfoot_td]:py-2! max-sm:[&_tfoot_td[data-solo-escritorio]]:hidden!";
export const ANULADA_CHIP =
  "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] line-through";

export type Casillero = "enPieM3" | "taladoSinTrozarM3" | "enPatioM3";
export const CASILLEROS: Casillero[] = ["enPieM3", "taladoSinTrozarM3", "enPatioM3"];
