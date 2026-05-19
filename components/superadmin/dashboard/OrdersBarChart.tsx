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
  LabelList,
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
  // Default; el parent pasa el rango activo del filtro.
  description = "Histórico de pedidos",
}: Props) {
  const tokens = useChartTokens();
  const purple = "#8b5cf6";
  const avg =
    data.length > 0 ? data.reduce((sum, d) => sum + d.orders, 0) / data.length : 0;

  return (
    <ChartWrapper title={title} description={description}>
      <div style={{ width: "100%", height: 300, minHeight: 220 }}>
        <ResponsiveContainer width="99%" height="99%" debounce={50}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={tokens.grid}
              vertical={false}
            />
            <XAxis
              dataKey="day"
              stroke={tokens.axis}
              tick={{ fontSize: 11, fill: tokens.axis, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: tokens.grid }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              stroke={tokens.axis}
              tick={{ fontSize: 12, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              width={30}
              allowDecimals={false}
            />
            <Tooltip
              content={<OrdersTooltip />}
              cursor={{ fill: purple, opacity: 0.08 }}
            />
            <ReferenceLine
              y={avg}
              stroke={purple}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              opacity={0.7}
              label={{
                value: `Prom. ${avg.toFixed(1)}`,
                position: "right",
                fill: purple,
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            <defs>
              <linearGradient id="ordersBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={purple} stopOpacity={1} />
                <stop offset="100%" stopColor={purple} stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <Bar
              dataKey="orders"
              fill="url(#ordersBarGrad)"
              radius={[5, 5, 0, 0]}
              maxBarSize={22}
            >
              {/* Labels sobre cada barra — solo si valor > 0 para no
                  contaminar fines de semana sin pedidos. Tipografía
                  pequeña pero tabular para alineación perfecta. */}
              <LabelList
                dataKey="orders"
                position="top"
                offset={4}
                fontSize={10}
                fontWeight={700}
                fill={purple}
                formatter={(v: unknown) =>
                  typeof v === "number" && v > 0 ? String(v) : ""
                }
                style={{ fontFamily: "var(--font-sans)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
