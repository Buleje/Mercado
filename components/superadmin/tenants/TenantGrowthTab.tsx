"use client";

import {
  Loader2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "@buleje/design-system/icons";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { GrowthEntry } from "./types";

interface TenantGrowthTabProps {
  growthData: GrowthEntry[];
  loading: boolean;
}

const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);

function fmtMonthLabel(monthStr: string): string {
  // monthStr puede venir como "2026-04", "abr 2026", "abril", etc.
  // Intentamos parsear; si no, devolvemos tal cual.
  const tryDate = new Date(/^\d{4}-\d{2}$/.test(monthStr) ? monthStr + "-01" : monthStr);
  if (Number.isFinite(tryDate.getTime())) {
    return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(tryDate);
  }
  return monthStr;
}

interface GrowthTooltipPayload {
  payload?: { month: string; revenue: number; orders: number };
  value?: number;
  name?: string;
  dataKey?: string;
}

interface GrowthTooltipProps {
  active?: boolean;
  payload?: GrowthTooltipPayload[];
  label?: unknown;
}

function GrowthTooltip({ active, payload, label }: GrowthTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const revenue = payload.find((x) => x?.dataKey === "revenue")?.value ?? 0;
  const orders = payload.find((x) => x?.dataKey === "orders")?.value ?? 0;
  const monthLabel = fmtMonthLabel(String(label ?? ""));
  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-lg min-w-[180px]">
      <p className="text-sm font-bold capitalize text-[var(--text-primary)] mb-1">{monthLabel}</p>
      <p className="text-sm text-[var(--text-secondary)] flex items-center justify-between gap-3">
        <span>Ingresos</span>
        <strong className="tabular-nums text-[var(--text-primary)]">{fmtSoles(revenue)}</strong>
      </p>
      <p className="text-sm text-[var(--text-secondary)] flex items-center justify-between gap-3">
        <span>Pedidos</span>
        <strong className="tabular-nums text-[var(--text-primary)]">{orders}</strong>
      </p>
    </div>
  );
}

export function TenantGrowthTab({ growthData, loading }: TenantGrowthTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-base text-[var(--text-tertiary)]">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando datos de crecimiento…
      </div>
    );
  }

  if (growthData.length === 0) {
    return (
      <div className="text-center py-20 text-base text-[var(--text-tertiary)]">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
        No hay datos de crecimiento
      </div>
    );
  }

  const totalRevenue = growthData.reduce(
    (s, g) => s + (g.months[g.months.length - 1]?.revenue ?? 0),
    0,
  );
  const totalOrders = growthData.reduce(
    (s, g) => s + (g.months[g.months.length - 1]?.orders ?? 0),
    0,
  );
  const avgGrowth =
    growthData.reduce((s, g) => s + g.growthPct, 0) / (growthData.length || 1);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Tiendas activas", value: growthData.length },
          { label: "Ingresos totales/mes", value: `S/${totalRevenue.toFixed(0)}` },
          { label: "Pedidos totales/mes", value: totalOrders },
          { label: "Crecimiento promedio", value: `${avgGrowth.toFixed(0)}%` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-center"
          >
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {value}
            </div>
            <div className="text-sm text-[var(--text-secondary)] mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Per-store growth cards */}
      <div className="space-y-4">
        {growthData.map((store) => {
          const lastMonth = store.months[store.months.length - 1];
          const prevMonth = store.months[store.months.length - 2];
          // Mes con mayor revenue → resalta como peak
          const peakIdx = store.months.reduce(
            (max, m, i, arr) => (m.revenue > (arr[max]?.revenue ?? 0) ? i : max),
            0,
          );

          return (
            <div
              key={store.slug}
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4 hover:border-[var(--accent)] transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white font-bold text-base shrink-0">
                    {store.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-[var(--text-primary)] truncate">
                      {store.name}
                    </div>
                    <div className="text-sm text-[var(--text-tertiary)] font-mono truncate">
                      {store.slug}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className={
                      "flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold " +
                      (store.growthPct > 0
                        ? "bg-[var(--data-success-100)] text-[var(--data-success-500)]"
                        : store.growthPct < 0
                          ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                          : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")
                    }
                  >
                    {store.growthPct > 0 ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : store.growthPct < 0 ? (
                      <ArrowDownRight className="w-4 h-4" />
                    ) : null}
                    {store.growthPct > 0 ? "+" : ""}
                    {store.growthPct}%
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                      S/{(lastMonth?.revenue ?? 0).toFixed(0)}
                    </div>
                    <div className="text-sm text-[var(--text-tertiary)] tabular-nums">
                      {lastMonth?.orders ?? 0} pedidos
                    </div>
                  </div>
                </div>
              </div>

              {/* Recharts ComposedChart: barras revenue + línea pedidos */}
              <div className="h-44">
                <ResponsiveContainer minWidth={0} width="100%" height="100%">
                  <ComposedChart
                    data={store.months}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--rule-soft)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 13, fill: "var(--text-secondary)" }}
                      tickMargin={6}
                      tickLine={false}
                      axisLine={{ stroke: "var(--rule-base)" }}
                    />
                    <YAxis
                      yAxisId="rev"
                      tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `S/${(v / 1000).toFixed(1)}k` : `S/${v}`
                      }
                    />
                    <YAxis
                      yAxisId="ord"
                      orientation="right"
                      tick={{ fontSize: 12, fill: "var(--text-tertiary)" }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<GrowthTooltip />}
                      cursor={{ fill: "var(--surface-sunken)", opacity: 0.3 }}
                    />
                    <Bar
                      yAxisId="rev"
                      dataKey="revenue"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    >
                      {store.months.map((_, i) => (
                        <Cell
                          key={i}
                          fill={
                            i === peakIdx
                              ? "var(--accent)"
                              : "var(--text-tertiary)"
                          }
                          opacity={i === peakIdx ? 1 : 0.45}
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="ord"
                      type="monotone"
                      dataKey="orders"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "var(--accent)", strokeWidth: 0 }}
                      activeDot={{
                        r: 6,
                        fill: "var(--accent)",
                        stroke: "var(--surface-canvas)",
                        strokeWidth: 2,
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly KPI row */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--rule-base)]">
                <div className="text-center">
                  <div className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                    S/{store.totalRevenue.toFixed(0)}
                  </div>
                  <div className="text-sm text-[var(--text-tertiary)]">Ingresos 6 meses</div>
                </div>
                <div className="text-center">
                  <div className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                    {store.totalOrders}
                  </div>
                  <div className="text-sm text-[var(--text-tertiary)]">Pedidos 6 meses</div>
                </div>
                <div className="text-center">
                  <div className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                    S/
                    {store.totalOrders > 0
                      ? (store.totalRevenue / store.totalOrders).toFixed(0)
                      : "0"}
                  </div>
                  <div className="text-sm text-[var(--text-tertiary)]">Ticket promedio</div>
                </div>
              </div>

              {/* Projection */}
              {lastMonth && prevMonth && (
                <div className="bg-[var(--accent-soft)] rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span className="text-[var(--text-secondary)]">
                    Proyección próximo mes:{" "}
                    <strong className="text-[var(--text-primary)] tabular-nums">
                      S/
                      {Math.max(
                        0,
                        lastMonth.revenue + (lastMonth.revenue - prevMonth.revenue),
                      ).toFixed(0)}
                    </strong>{" "}
                    (
                    <strong className="text-[var(--text-primary)] tabular-nums">
                      {Math.max(0, lastMonth.orders + (lastMonth.orders - prevMonth.orders))}
                    </strong>{" "}
                    pedidos)
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
