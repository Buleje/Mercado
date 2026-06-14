"use client";

import type { TenantRisk } from "@/lib/superadmin-types";

/**
 * Badge de salud/riesgo de churn de un tenant. Fuente: TenantHealthScore.
 * Brandon 2026-06-14 (bundle A · /superadmin/tenants).
 */
const LEVEL_META: Record<
  TenantRisk["level"],
  { label: string; cls: string; dot: string }
> = {
  critical: { label: "Crítico", cls: "bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-700,#b91c1c)] dark:bg-red-950/40 dark:text-red-300", dot: "bg-[var(--data-error-500,#ef4444)]" },
  high:     { label: "Alto",    cls: "bg-[var(--data-warning-50,#fffbeb)] text-[var(--data-warning-700,#b45309)] dark:bg-amber-950/40 dark:text-amber-300", dot: "bg-[var(--data-warning-500,#f59e0b)]" },
  medium:   { label: "Medio",   cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", dot: "bg-[var(--data-warning-400,#fbbf24)]" },
  low:      { label: "Sano",    cls: "bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-700,#047857)] dark:bg-emerald-950/40 dark:text-emerald-300", dot: "bg-[var(--data-success-500,#10b981)]" },
};

export function RiskBadge({ risk, compact = false }: { risk: TenantRisk | null | undefined; compact?: boolean }) {
  if (!risk) {
    return <span className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">—</span>;
  }
  const m = LEVEL_META[risk.level] ?? LEVEL_META.low;
  return (
    <span
      title={`Health score ${risk.score}/100 · ${m.label}${risk.signals ? ` · ${risk.signals} señal(es)` : ""}${risk.daysSinceLastLogin != null ? ` · login hace ${risk.daysSinceLastLogin}d` : ""}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${m.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {compact ? risk.score : <>{m.label} <span className="tabular-nums opacity-70">{risk.score}</span></>}
    </span>
  );
}
