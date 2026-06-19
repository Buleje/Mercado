import type { ComponentType, ReactNode } from "react";

/**
 * SAKpiCard — tarjeta de KPI canónica del superadmin (Brandon 2026-06-19).
 * Antes este mismo componente estaba reimplementado en ~15 archivos (Kpi/KpiCard
 * locales, casi idénticos). Esta es la única fuente: herencia real, un solo
 * lugar para ajustar estilo/tonos. Hereda los tokens de plataforma.
 */

export type SAKpiTone = "default" | "good" | "warn" | "bad";

const TONE: Record<SAKpiTone, string> = {
  good: "text-[var(--data-success-600,#059669)]",
  warn: "text-[#0d9488]",
  bad: "text-[var(--data-error-600,#dc2626)]",
  default: "text-[var(--text-primary)]",
};

export interface SAKpiCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: SAKpiTone;
  className?: string;
}

export function SAKpiCard({ label, value, sub, icon: Icon, tone = "default", className }: SAKpiCardProps) {
  return (
    <div className={["border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3", className].filter(Boolean).join(" ")}>
      <div className="flex items-center gap-1.5 mb-1 text-[var(--text-tertiary)]">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-display text-2xl font-extrabold tabular-nums ${TONE[tone]}`}>{value}</p>
      {sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}
