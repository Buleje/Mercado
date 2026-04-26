"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartWrapper, useChartTokens } from "@buleje/design-system";
import type { OrdersSeriesPoint } from "@/lib/mocks/superadmin-dashboard.mock";

interface Props {
  data: OrdersSeriesPoint[];
  title?: string;
  description?: string;
}

function OrdersTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: OrdersSeriesPoint }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const value = entry?.value ?? 0;
  const dayLabel = entry?.payload.label ?? "";
  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-sm)]">
      <div className="text-[length:var(--ts-xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold mb-1">
        {dayLabel} — {label}
      </div>
      <div className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
        {value} pedidos
      </div>
    </div>
  );
}

/**
 * Orders per day — BarChart con línea de promedio.
 *
 * MOCK: datos vienen de `buildOrdersSeries(targetTotal)` con dip de fin de semana.
 * Reemplazar cuando exista /api/superadmin/dashboard/orders-series.
 */
export function OrdersBarChart({
  data,
  title = "Pedidos por día",
  description = "Últimos 30 días",
}: Props) {
  const tokens = useChartTokens();
  const avg =
    data.length > 0 ? data.reduce((sum, d) => sum + d.orders, 0) / data.length : 0;

  return (
    <ChartWrapper title={title} description={description}>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={tokens.grid}
              vertical={false}
            />
            <XAxis
              dataKey="day"
              stroke={tokens.axis}
              tick={{ fontSize: 13, fill: tokens.axis }}
              tickLine={false}
              axisLine={{ stroke: tokens.grid }}
              interval={4}
            />
            <YAxis
              stroke={tokens.axis}
              tick={{ fontSize: 13, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              width={30}
              allowDecimals={false}
            />
            <Tooltip
              content={<OrdersTooltip />}
              cursor={{ fill: tokens.grid, opacity: 0.35 }}
            />
            <ReferenceLine
              y={avg}
              stroke={tokens.axis}
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `Prom. ${avg.toFixed(0)}`,
                position: "right",
                fill: tokens.axis,
                fontSize: 13,
                fontWeight: 600,
              }}
            />
            <Bar
              dataKey="orders"
              fill={tokens.stroke}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
