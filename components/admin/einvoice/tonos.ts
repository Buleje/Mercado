/**
 * Tonos de Seguimiento y Expediente (tokens del DS, también en oscuro). Un solo
 * lugar para que «alta» se pinte igual en la bandeja, el expediente y la
 * conciliación.
 */
export type Tono = "error" | "aviso" | "ok" | "info" | "neutro";

export const TEXTO_TONO: Record<Tono, string> = {
  error: "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
  aviso: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  ok: "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  info: "text-[var(--data-info-ink)] dark:text-[var(--data-info-500)]",
  neutro: "text-[var(--text-secondary)]",
};

export const CHIP_TONO: Record<Tono, string> = {
  error: "bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  aviso: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
  ok: "bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]",
  info: "bg-[var(--data-info-50)] text-[var(--data-info-ink)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

/** Punto de color al lado de un aviso (la gravedad no se dice sólo con color: va el texto al lado). */
export const PUNTO_TONO: Record<Tono, string> = {
  error: "bg-[var(--data-error-500)]",
  aviso: "bg-[var(--data-warning-500)]",
  ok: "bg-[var(--data-success-500)]",
  info: "bg-[var(--data-info-500)]",
  neutro: "bg-[var(--text-tertiary)]",
};

export const TONO_GRAVEDAD: Record<"alta" | "media" | "baja", Tono> = { alta: "error", media: "aviso", baja: "neutro" };
export const ROTULO_GRAVEDAD: Record<"alta" | "media" | "baja", string> = { alta: "Urgente", media: "Revisar", baja: "Cuando puedas" };

export const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold whitespace-nowrap";
