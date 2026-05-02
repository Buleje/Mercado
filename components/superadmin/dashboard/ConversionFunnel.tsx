"use client";

import { ChartWrapper, Caption } from "@buleje/design-system";
import { fmtNumber, type FunnelStep } from "@/lib/mocks/superadmin-dashboard.mock";

interface Props {
  steps: FunnelStep[];
}

/**
 * Funnel de conversión con 4 pasos visitas→carritos→checkouts→pagados.
 *
 * MOCK: FUNNEL_MOCK estático. Reemplazar con
 * /api/superadmin/dashboard/funnel?window=30d.
 */
export function ConversionFunnel({ steps }: Props) {
  if (steps.length === 0) return null;
  const top = steps[0]!.value || 1;

  return (
    <ChartWrapper title="Funnel de conversión" description="Últimos 30 días">
      <ul className="space-y-3">
        {steps.map((step, i) => {
          const pct = (step.value / top) * 100;
          const vsPrev =
            i > 0
              ? (step.value / (steps[i - 1]!.value || 1)) * 100
              : 100;
          return (
            <li key={step.key}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-[length:var(--ts-base)] font-bold text-[var(--text-primary)]">
                  {step.label}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--text-primary)]">
                    {fmtNumber(step.value)}
                  </span>
                  <span className="text-[length:var(--ts-sm)] font-bold tabular-nums w-14 text-right text-[var(--text-tertiary)]">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="relative h-10 rounded-lg bg-[var(--surface-sunken)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${
                      ["#00B4A6", "#0ea5e9", "#8b5cf6", "#f59e0b"][i] ?? "#00B4A6"
                    } 0%, ${
                      ["#34d4be", "#38bdf8", "#a78bfa", "#fbbf24"][i] ?? "#34d4be"
                    } 100%)`,
                  }}
                  aria-hidden
                />
              </div>
              {i > 0 && (
                <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  Paso a paso: <strong className="text-[var(--text-secondary)]">{vsPrev.toFixed(1)}%</strong> vs {steps[i - 1]!.label.toLowerCase()}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </ChartWrapper>
  );
}
