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
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
                  {step.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                    {fmtNumber(step.value)}
                  </span>
                  <Caption className="tabular-nums w-12 text-right">
                    {pct.toFixed(1)}%
                  </Caption>
                </div>
              </div>
              <div className="relative h-7 rounded-md bg-[var(--surface-sunken)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-[var(--text-primary)] transition-all"
                  style={{ width: `${pct}%`, opacity: 0.85 - i * 0.15 }}
                  aria-hidden
                />
              </div>
              {i > 0 && (
                <Caption className="mt-1 block text-[var(--text-tertiary)]">
                  Paso a paso: {vsPrev.toFixed(1)}% vs {steps[i - 1]!.label.toLowerCase()}
                </Caption>
              )}
            </li>
          );
        })}
      </ul>
    </ChartWrapper>
  );
}
