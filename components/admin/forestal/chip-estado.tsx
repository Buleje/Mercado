"use client";

/**
 * Chip de filtro por estado, con su cuenta. Uno solo para el Expediente de
 * trámites y para Plantaciones (antes, dos copias del mismo botón con dos
 * tablas de tonos iguales). 48 px de alto: va en la fila del buscador.
 */

/** Chip (reposo y elegido) y barra lateral de la fila, por tono del estado. */
export const TONO_ESTADO: Record<string, { chip: string; activo: string; barra: string }> = {
  muted: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo: "border-[var(--rule-strong)] bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    barra: "bg-[var(--text-tertiary)]",
  },
  info: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
    barra: "bg-[var(--data-info-500)]",
  },
  warning: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
    barra: "bg-[var(--data-warning-500)]",
  },
  success: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    activo:
      "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
    barra: "bg-[var(--data-success-500)]",
  },
};

export function ChipEstado({
  label,
  count,
  activo,
  tono = "muted",
  onClick,
}: {
  label: string;
  count: number;
  activo: boolean;
  tono?: string;
  onClick: () => void;
}) {
  const t = TONO_ESTADO[tono] ?? TONO_ESTADO.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      disabled={count === 0 && !activo}
      className={`inline-flex h-12 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold transition disabled:opacity-40 ${
        activo ? t.activo : `${t.chip} hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]`
      }`}
    >
      {label}
      <span className="font-mono tabular-nums">{count}</span>
    </button>
  );
}
