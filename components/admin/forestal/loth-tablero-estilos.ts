/**
 * Clases compartidas del Control del permiso (ADR-459). Viven aparte de los
 * componentes: un módulo de componente que además exporta constantes corta el
 * Fast Refresh (recarga la página entera en cada guardado).
 */

import type { EstadoTroza } from "@/lib/forestal/loth-tablero-trozas";

/** Cada estado con su color. Rojo = ya no está disponible (pedido de Brandon). */
export const TONO_ESTADO: Record<EstadoTroza, { chip: string; punto: string }> = {
  disponible: {
    chip: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
    punto: "bg-[var(--data-success-500)]",
  },
  despachada: {
    chip: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
    punto: "bg-[var(--data-error-500)]",
  },
  consumida: {
    chip: "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
    punto: "bg-[var(--data-warning-500)]",
  },
  descartada: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
    punto: "bg-[var(--text-tertiary)]",
  },
  fantasma: {
    chip: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
    punto: "bg-[var(--data-error-500)]",
  },
};

/** Tabla también en el celular: el padding que `hoja-grilla` aplasta a 3 px vuelve (memoria `tabla-ancha-hoja-grilla`). */
export const HOJA_MOVIL = "hoja-grilla max-sm:[&_tbody_td]:px-2! max-sm:[&_tbody_td]:py-2! max-sm:[&_tbody_td]:whitespace-nowrap";
/**
 * Planilla con controles en la celda (selects, chips): globals.css manda todo
 * `.flex` de una celda a la derecha y en varias líneas, y a 400 px cada fila del
 * cubicador medía 135 px (memoria `hoja-grilla-flex-y-pie-oculto`). Esto los deja en una línea.
 */
export const CELDAS_FLEX_EN_FILA =
  "max-sm:[&_td_.flex]:flex-nowrap! max-sm:[&_td_.flex]:justify-start! max-sm:[&_td_.inline-flex]:flex-nowrap! max-sm:[&_td_.inline-flex]:justify-start!";
