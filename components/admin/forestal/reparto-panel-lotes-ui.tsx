/**
 * Piezas visuales compartidas por las tres pestañas del panel «Lotes» de la
 * Distribución: los botones y las líneas de aviso. Sin estado.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Check } from "@buleje/design-system/icons";

export const BTN =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50";
export const BTN_PRIMARIO =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50";
export const CAMPO =
  "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

type Tono = "error" | "aviso" | "ok";

const TONOS: Record<Tono, string> = {
  error:
    "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  aviso:
    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  ok: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
};

/** Una línea que pide atención (o confirma). `error` se anuncia al lector de pantalla. */
export function Aviso({ tono, children }: { tono: Tono; children: ReactNode }) {
  const Icono = tono === "ok" ? Check : AlertTriangle;
  return (
    <p
      role={tono === "error" ? "alert" : undefined}
      className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${TONOS[tono]}`}
    >
      <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
