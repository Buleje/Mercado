import type { ComponentType, ReactNode } from "react";

/**
 * SAMetricCard — tarjeta KPI "ejecutiva" del superadmin: badge de icono arriba +
 * label/value/sub debajo (Brandon 2026-06-19). Tercer primitivo KPI, complementa
 * a [[SAKpiCard]] (compacto, grillas densas) y SAStatCard (trend+sparkline, ADR-074).
 * Antes esta card estaba clonada en analytics y security/OverviewTab.
 *
 * `colorValue`: si true el value toma el color del tono (OverviewTab); si false
 * queda en text-primary (analytics). El borde redondeado lo cuadra el override
 * global del superadmin (`[data-area="superadmin"]`), así que el look no cambia.
 */

export type SAMetricTone = "accent" | "success" | "warning" | "danger" | "neutral";

const ICON_BG: Record<SAMetricTone, string> = {
  accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
  success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
  warning: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

const VALUE_TONE: Record<SAMetricTone, string> = {
  accent: "text-[var(--accent)]",
  success: "text-[var(--data-success-600,#059669)]",
  warning: "text-teal-700 dark:text-teal-300",
  danger: "text-rose-700 dark:text-rose-300",
  neutral: "text-[var(--text-primary)]",
};

export interface SAMetricCardProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: SAMetricTone;
  /** Texto chico arriba a la derecha (ej. "30 días"). */
  periodHint?: string;
  /** Si true el value toma el color del tono; default text-primary. */
  colorValue?: boolean;
}

export function SAMetricCard({ icon: Icon, label, value, sub, tone = "neutral", periodHint, colorValue = false }: SAMetricCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${ICON_BG[tone]}`}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        {periodHint && (
          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{periodHint}</span>
        )}
      </div>
      <p className="mt-4 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums tracking-tight ${colorValue ? VALUE_TONE[tone] : "text-[var(--text-primary)]"}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}
