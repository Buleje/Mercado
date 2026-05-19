"use client";

/**
 * MonthlyOverviewChart — composed chart (Area de revenue + Bars de signups)
 * con eje dual. Más legible que el daily porque agrupa la actividad en
 * los últimos 6 meses, donde los datos del SaaS ya son densos.
 */

import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper, useChartTokens } from "@buleje/design-system";
import { TrendingUp } from "@buleje/design-system/icons";
import { fmtSoles } from "@/lib/mocks/superadmin-dashboard.mock";

interface MonthPoint {
  month: string;
  revenue: number;
  signups: number;
}

interface Props {
  data: MonthPoint[];
  /** Subtítulo dinámico — viene del filtro de rango activo. */
  description?: string;
}

function MonthlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rev = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
  const sign = payload.find((p) => p.dataKey === "signups")?.value ?? 0;
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 shadow-[var(--shadow-md)] min-w-[180px]">
      <div className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-bold mb-1.5">
        {label}
      </div>
      <div className="flex items-center justify-between gap-4 mb-1">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" aria-hidden />
          Ingresos
        </span>
        <span className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
          {fmtSoles(rev)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--data-info,#3b82f6)]" aria-hidden />
          Nuevas tiendas
        </span>
        <span className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
          {sign}
        </span>
      </div>
    </div>
  );
}

export function MonthlyOverviewChart({ data, description }: Props) {
  const tokens = useChartTokens();
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalSign = data.reduce((s, d) => s + d.signups, 0);
  const peakRev = data.reduce((m, d) => Math.max(m, d.revenue), 0);
  const peakMonth = data.find((d) => d.revenue === peakRev)?.month ?? "—";

  return (
    <ChartWrapper
      title="Visión mensual del negocio"
      description={description ?? "Ingresos recurrentes (área) y nuevas tiendas (barras)"}
      actions={
        <div className="hidden sm:flex items-center gap-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--data-success,#10b981)]" />
            <span className="font-semibold text-[var(--text-secondary)]">Pico:</span>
            <span className="font-bold text-[var(--text-primary)]">{peakMonth}</span>
          </span>
        </div>
      }
    >
      {/* Mini summary chips */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <div className="text-[length:var(--ts-2xs)] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">
            Ingresos 6m
          </div>
          <div className="mt-0.5 text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--text-primary)]">
            {fmtSoles(totalRev)}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <div className="text-[length:var(--ts-2xs)] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">
            Nuevas tiendas
          </div>
          <div className="mt-0.5 text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--text-primary)]">
            {totalSign}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <div className="text-[length:var(--ts-2xs)] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">
            Mejor mes
          </div>
          <div className="mt-0.5 text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--text-primary)]">
            {peakMonth}
          </div>
        </div>
      </div>

      <div style={{ width: "100%", height: 320, minHeight: 240 }}>
        <ResponsiveContainer width="99%" height="99%" debounce={50}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent, #6366f1)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--accent, #6366f1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} vertical={false} />
            <XAxis
              dataKey="month"
              stroke={tokens.axis}
              tick={{ fontSize: 13, fill: tokens.axis, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: tokens.grid }}
            />
            <YAxis
              yAxisId="rev"
              orientation="left"
              stroke={tokens.axis}
              tick={{ fontSize: 12, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
              width={52}
            />
            <YAxis
              yAxisId="sign"
              orientation="right"
              stroke={tokens.axis}
              tick={{ fontSize: 12, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={32}
            />
            <Tooltip
              content={<MonthlyTooltip />}
              cursor={{ stroke: tokens.grid, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Legend
              verticalAlign="top"
              height={26}
              wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              yAxisId="sign"
              dataKey="signups"
              name="Nuevas tiendas"
              fill="var(--data-info, #3b82f6)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              opacity={0.55}
            />
            <Area
              yAxisId="rev"
              type="monotone"
              dataKey="revenue"
              name="Ingresos (S/)"
              stroke="var(--accent, #6366f1)"
              strokeWidth={2.5}
              fill="url(#revArea)"
              activeDot={{
                r: 6,
                fill: "var(--accent, #6366f1)",
                stroke: "var(--surface-canvas)",
                strokeWidth: 2,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
