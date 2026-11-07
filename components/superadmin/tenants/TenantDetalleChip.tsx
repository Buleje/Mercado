import type { ReactNode } from "react";

/** Tono de una etiqueta de estado de la ficha rápida. */
export type TonoChip = "ok" | "alerta" | "neutro" | "acento";

const TONOS: Record<TonoChip, string> = {
  ok: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] ring-[var(--data-success-500)]/25",
  alerta: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] ring-[var(--data-warning-500)]/30",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-[var(--rule-base)]",
  acento: "bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)] ring-[var(--accent-muted)]",
};

/** Etiqueta chica de estado (Publicada, Gmail, Pausados…): un solo estilo en toda la ficha. */
export function ChipEstado({ tono = "neutro", children, className = "" }: { tono?: TonoChip; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONOS[tono]} ${className}`}
    >
      {children}
    </span>
  );
}
