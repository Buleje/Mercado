/**
 * Clases del alta de persona: el campo estándar del panel (ADR-489, el mismo
 * de Planificación y Ajustes) y no la «píldora gris» de los modales viejos de
 * adelantos (`inputCls`).
 *
 * `dark:bg-[var(--surface-sunken)]` va a propósito: sin una clase `dark:bg-`,
 * globals.css (`.dark [data-admin-shell] input:not([class*="dark:bg-"])`) pisa
 * el fondo Y el borde, y el borde coral de «está mal» no se vería en oscuro.
 * El borde de aviso REEMPLAZA al `--rule-base` (nunca los dos): el selector de
 * oscuro de `--rule-base` gana por especificidad.
 */
import { cn } from "@/lib/utils";

const BASE =
  "w-full rounded-xl border bg-[var(--surface-raised)] dark:bg-[var(--surface-sunken)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-60";

/** Campo de 48 px. `mal` = el borde coral de «esto no puede ser». */
export function campo(mal = false, extra?: string): string {
  return cn("h-12", BASE, mal ? "border-[var(--data-warning-500)]" : "border-[var(--rule-base)]", extra);
}

export const CAMPO = campo();

/** Texto largo (notas): sin alto fijo. */
export const AREA = cn("min-h-24 py-2.5 resize-y", BASE, "border-[var(--rule-base)]");

/** La tarjeta de cada sección, igual a la del `Plegable` (variante tarjeta). */
export const TARJETA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]";

/** Línea debajo de un campo. */
export const PIE = "mt-1.5 flex items-start gap-1.5 text-sm";
export const PIE_AYUDA = "text-[var(--text-tertiary)]";
export const PIE_AVISO = "font-semibold text-[var(--data-warning-ink)]";
export const PIE_OK = "font-semibold text-[var(--data-success-ink)]";

/** Etiqueta de un campo hecho a mano (los demás van con `Field` de adelantos). */
export const ROTULO = "mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]";
