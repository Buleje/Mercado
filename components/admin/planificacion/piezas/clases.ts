/**
 * piezas/clases.ts — las clases que comparten las vistas del plan (FODA,
 * objetivos, organización y políticas, ADR-497). Sin "use client": son strings.
 *
 * Campos y chips a 48 px (ADR-489, `ALTURA_CONTROL`); color sólo por tokens.
 * El color de estado es el de los datos (`--data-*`), con `-ink` para el texto
 * (ya trae su variante oscura y llega a AA en 12-14 px).
 */

/** Campo de formulario (el alto lo pone cada uso). */
export const CAMPO =
  "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-60";

/** Input y select a 48 px. */
export const CAMPO_ALTO = `${CAMPO} h-12`;

/** Texto largo: crece con lo escrito (Chromium) y deja de hacerlo en 12 líneas. */
export const AREA_TEXTO = `${CAMPO} min-h-24 resize-y py-2.5 leading-relaxed`;

/**
 * Texto editable en su lugar (un punto del FODA, un paso del protocolo): sin
 * borde hasta que se toca, crece con lo escrito.
 */
export const EN_LUGAR =
  "w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm leading-snug text-[var(--text-primary)] outline-none [field-sizing:content] placeholder:text-[var(--text-tertiary)] hover:border-[var(--rule-base)] focus:border-[var(--accent)] focus:bg-[var(--surface-raised)] focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Caja de un bloque o de una tarjeta. */
export const TARJETA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]";

/** Chip de filtro o de elección (tipo de estrategia, unidad, rubro). */
export function claseChip(activo: boolean): string {
  return `inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
    activo
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
  }`;
}

export type Tono = "exito" | "info" | "aviso" | "error" | "neutro";

/** Pastilla chica de estado (el «atrasado», el «revisar», el impacto). */
export const PASTILLA = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap";

export const PASTILLA_TONO: Readonly<Record<Tono, string>> = {
  exito: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  info: "bg-[var(--data-info-500)]/12 text-[var(--data-info-ink)]",
  aviso: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]",
  error: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

/** Texto de color (el título de un cuadrante, una cifra). */
export const TEXTO_TONO: Readonly<Record<Tono, string>> = {
  exito: "text-[var(--data-success-ink)]",
  info: "text-[var(--data-info-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
  neutro: "text-[var(--text-secondary)]",
};

/** La raya de arriba de un cuadrante y su fondo apenas teñido. */
export const CAJA_TONO: Readonly<Record<Tono, string>> = {
  exito: "border-t-[var(--data-success-500)] bg-[var(--data-success-500)]/5",
  info: "border-t-[var(--data-info-500)] bg-[var(--data-info-500)]/5",
  aviso: "border-t-[var(--data-warning-500)] bg-[var(--data-warning-500)]/5",
  error: "border-t-[var(--data-error-500)] bg-[var(--data-error-500)]/5",
  neutro: "border-t-[var(--rule-base)] bg-[var(--surface-raised)]",
};

/** Relleno de una barra de avance. */
export const BARRA_TONO: Readonly<Record<Tono, string>> = {
  exito: "bg-[var(--data-success-500)]",
  info: "bg-[var(--data-info-500)]",
  aviso: "bg-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]",
  neutro: "bg-[var(--text-tertiary)]",
};
