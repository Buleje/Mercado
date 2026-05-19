"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
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
      <div className="text-[length:var(--ts-xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold mb-1">
        {label}
      </div>
      <div className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
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
  // Default usado en Storybook; en producción el parent pasa el rango activo.
  description = "Histórico de revenue",
}: Props) {
  const tokens = useChartTokens();
  const teal = "var(--brand-primary, #00B4A6)";

  return (
    <ChartWrapper title={title} description={description}>
      <div style={{ width: "100%", height: 300, minHeight: 220 }}>
        <ResponsiveContainer width="99%" height="99%" debounce={50}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={teal} stopOpacity={0.45} />
                <stop offset="95%" stopColor={teal} stopOpacity={0.02} />
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
              tick={{ fontSize: 11, fill: tokens.axis, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: tokens.grid }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              stroke={tokens.axis}
              tick={{ fontSize: 12, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
              width={46}
            />
            <Tooltip
              content={<RevenueTooltip />}
              cursor={{ stroke: teal, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={teal}
              strokeWidth={2.5}
              fill="url(#mrrGradient)"
              dot={{
                r: 3,
                fill: teal,
                stroke: "var(--surface-canvas)",
                strokeWidth: 1.5,
              }}
              activeDot={{
                r: 6,
                fill: teal,
                stroke: "var(--surface-canvas)",
                strokeWidth: 2,
              }}
            >
              {/* Etiqueta solo en el primero y último punto (evita ruido) +
                  el pico máximo. Brandon: "datos dentro de las barras" →
                  acá ponemos los valores clave directamente sobre la línea. */}
              <LabelList
                dataKey="revenue"
                position="top"
                offset={10}
                fontSize={10}
                fontWeight={700}
                fill={teal}
                formatter={(v: unknown) => {
                  if (typeof v !== "number" || v <= 0) return "";
                  // Solo mostrar si vale la pena la abreviación
                  if (v >= 1000) return `S/${(v / 1000).toFixed(1)}k`;
                  return `S/${Math.round(v)}`;
                }}
                style={{ fontFamily: "var(--font-sans)" }}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
