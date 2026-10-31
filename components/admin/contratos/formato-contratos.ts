import { formatDateNumeric, formatNumber } from "@/lib/format";
import type { EstadoVisible } from "@/lib/types/contracts";

/** Respeta la moneda del contrato: un contrato en dólares se mostraba en soles. */
export function formatMoney(n: number, moneda: "PEN" | "USD" = "PEN") {
  const simbolo = moneda === "USD" ? "US$" : "S/";
  return `${simbolo} ${formatNumber(n, 2)}`;
}

export function formatDatePeru(iso: string | null | undefined) {
  if (!iso) return "---";
  try {
    const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
    return formatDateNumeric(d);
  } catch { return iso; }
}

export const ESTADO_STYLES: Record<EstadoVisible, string> = {
  VIGENTE: "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  POR_VENCER: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
  VENCIDO: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
  PENDIENTE_FIRMA: "bg-[color-mix(in_oklch,var(--accent)_14%,transparent)] text-[var(--accent-ink)] dark:text-[var(--accent)]",
  RENOVADO: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  TERMINADO: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  ANULADO: "bg-[var(--rule-soft)] text-[var(--text-tertiary)]",
  BORRADOR: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};
