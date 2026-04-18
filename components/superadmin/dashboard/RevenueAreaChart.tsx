"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper, useChartTokens } from "@buleje/design-system";
import { fmtSoles } from "@/lib/mocks/superadmin-dashboard.mock";
import type { RevenueSeriesPoint } from "@/lib/mocks/superadmin-dashboard.mock";

interface Props {
  data: RevenueSeriesPoint[];
  title?: string;
  description?: string;
}

/**
 * Tooltip custom token-styled para Recharts.
 */
function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-sm)]">
      <div className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold mb-0.5">
        {label}
      </div>
      <div className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
        {fmtSoles(value)}
      </div>
    </div>
  );
}

/**
 * Revenue chart — AreaChart con gradient token-backed.
 *
 * MOCK: data proviene de `buildRevenueSeries(currentMRR)`. Reemplazar cuando
 * exista /api/superadmin/dashboard/revenue-series.
 */
export function RevenueAreaChart({
  data,
  title = "Ingresos recurrentes (MRR)",
  description = "Últimos 12 meses",
}: Props) {
  const tokens = useChartTokens();

  return (
    <ChartWrapper title={title} description={description}>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tokens.stroke} stopOpacity={0.28} />
                <stop offset="95%" stopColor={tokens.stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={tokens.grid}
              vertical={false}
            />
            <XAxis
              dataKey="month"
              stroke={tokens.axis}
              tick={{ fontSize: 11, fill: tokens.axis }}
              tickLine={false}
              axisLine={{ stroke: tokens.grid }}
            />
            <YAxis
              stroke={tokens.axis}
              tick={{ fontSize: 11, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
              width={46}
            />
            <Tooltip
              content={<RevenueTooltip />}
              cursor={{ stroke: tokens.grid, strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={tokens.stroke}
              strokeWidth={2}
              fill="url(#mrrGradient)"
              activeDot={{ r: 4, fill: tokens.stroke, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
