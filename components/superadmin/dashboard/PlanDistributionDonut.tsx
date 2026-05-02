"use client";

/**
 * PlanDistributionDonut — donut chart con la distribución de planes
 * (free / pro / business / enterprise) y resumen central.
 */

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartWrapper, useChartTokens } from "@buleje/design-system";

type Plan = "free" | "pro" | "business" | "enterprise";

interface Props {
  distribution: Record<Plan, number>;
}

const PLAN_COLORS: Record<Plan, string> = {
  free: "var(--rule-strong, #94a3b8)",
  pro: "var(--data-info, #3b82f6)",
  business: "var(--accent, #6366f1)",
  enterprise: "var(--data-success, #10b981)",
};

const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; payload: { total: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  if (!entry) return null;
  const pct = entry.payload.total > 0 ? (entry.value / entry.payload.total) * 100 : 0;
  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-sm)]">
      <div className="text-[length:var(--ts-xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-bold mb-0.5">
        {entry.name}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
          {entry.value}
        </span>
        <span className="text-[length:var(--ts-xs)] tabular-nums text-[var(--text-secondary)]">
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export function PlanDistributionDonut({ distribution }: Props) {
  useChartTokens();

  const { data, total, paying } = useMemo(() => {
    const t = (Object.values(distribution) as number[]).reduce((s, v) => s + v, 0);
    const p = (["pro", "business", "enterprise"] as Plan[])
      .map((k) => distribution[k] ?? 0)
      .reduce((s, v) => s + v, 0);
    const arr = (["enterprise", "business", "pro", "free"] as Plan[])
      .map((plan) => ({
        name: PLAN_LABELS[plan],
        value: distribution[plan] ?? 0,
        plan,
        total: t,
      }))
      .filter((d) => d.value > 0);
    return { data: arr, total: t, paying: p };
  }, [distribution]);

  const payingPct = total > 0 ? (paying / total) * 100 : 0;

  return (
    <ChartWrapper
      title="Distribución por plan"
      description="Composición actual de la base de tenants"
    >
      {total === 0 ? (
        <div className="py-12 text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
          Sin tiendas registradas todavía.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative" style={{ width: "100%", height: 200, minHeight: 160 }}>
            <ResponsiveContainer width="99%" height="99%" debounce={50}>
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={60}
                  outerRadius={88}
                  paddingAngle={2}
                  cornerRadius={6}
                  dataKey="value"
                  stroke="var(--surface-canvas)"
                  strokeWidth={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan]} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Total
              </span>
              <span className="text-[length:var(--ts-2xl)] font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
                {total}
              </span>
              <span className="mt-1 text-[length:var(--ts-2xs)] font-semibold tabular-nums text-[var(--data-success,#10b981)]">
                {payingPct.toFixed(0)}% de pago
              </span>
            </div>
          </div>

          {/* Legend con barras */}
          <ul className="space-y-2">
            {(["enterprise", "business", "pro", "free"] as Plan[]).map((plan) => {
              const v = distribution[plan] ?? 0;
              const pct = total > 0 ? (v / total) * 100 : 0;
              return (
                <li key={plan} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PLAN_COLORS[plan] }}
                    aria-hidden
                  />
                  <span className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] flex-1">
                    {PLAN_LABELS[plan]}
                  </span>
                  <span className="text-[length:var(--ts-sm)] font-extrabold tabular-nums text-[var(--text-primary)] w-8 text-right">
                    {v}
                  </span>
                  <span className="text-[length:var(--ts-xs)] font-semibold tabular-nums text-[var(--text-tertiary)] w-10 text-right">
                    {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ChartWrapper>
  );
}
