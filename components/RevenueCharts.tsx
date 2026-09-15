"use client";

/**
 * RevenueCharts — 3 charts adaptativos según el periodo seleccionado.
 *
 * Recibe `from` y `to` ISO date strings (YYYY-MM-DD). Fetchea
 * `/api/superadmin/analytics?from=...&to=...` y renderiza:
 *  - Tendencia de ingresos
 *  - Nuevos registros
 *  - Pedidos
 *
 * La granularidad la calcula el backend según la duración:
 *  - 0-2 días → hourly, 3-90 → daily, 91-730 → monthly, 731+ → yearly.
 *
 * Los títulos de los charts y el label del eje X cambian dinámicamente.
 */

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  Users,
  ShoppingBag,
  Loader2,
} from "@buleje/design-system/icons";

interface PeriodData {
  from: string;
  to: string;
  granularity: "hour" | "day" | "month" | "year";
  durationDays: number;
  signups: { bucket: string; count: number; iso: string }[];
  revenue: { bucket: string; revenue: number; iso: string }[];
  orders: { bucket: string; count: number; iso: string }[];
}

interface AnalyticsData {
  period?: PeriodData;
  // Legacy fallbacks
  monthlySignups: { month: string; count: number }[];
  monthlyRevenue: { month: string; revenue: number }[];
}

const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const GRANULARITY_LABEL: Record<PeriodData["granularity"], string> = {
  hour: "por hora",
  day: "por día",
  month: "por mes",
  year: "por año",
};

export interface RevenueChartsProps {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  periodLabel?: string;
}

export default function RevenueCharts({ from, to, periodLabel }: RevenueChartsProps = {}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = from && to ? `?from=${from}&to=${to}` : "";
    fetch(`/api/superadmin/analytics${qs}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-40 bg-[var(--surface-sunken)] animate-pulse rounded" />
                <div className="h-3 w-24 bg-[var(--surface-sunken)]/60 animate-pulse rounded" />
              </div>
            </div>
            <div className="h-48 bg-[var(--surface-sunken)]/60 animate-pulse rounded-xl flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">
          No se pudieron cargar los datos de analytics.
        </p>
      </div>
    );
  }

  const series = data.period;
  // Fallback al legacy si el backend no devolvió `period`
  const revenueSeries =
    series?.revenue.map((r) => ({ bucket: r.bucket, revenue: r.revenue })) ??
    data.monthlyRevenue.map((r) => ({ bucket: r.month, revenue: r.revenue }));
  const signupSeries =
    series?.signups.map((s) => ({ bucket: s.bucket, count: s.count })) ??
    data.monthlySignups.map((s) => ({ bucket: s.month, count: s.count }));
  const orderSeries = series?.orders.map((o) => ({ bucket: o.bucket, count: o.count })) ?? [];

  const granularityLabel = series ? GRANULARITY_LABEL[series.granularity] : "por mes";
  const ctxLabel = periodLabel ? ` · ${periodLabel}` : "";

  return (
    <div className="space-y-5">
      {/* ─── Revenue ──────────────────────────────────────────── */}
      <ChartCard
        icon={DollarSign}
        title="Tendencia de ingresos"
        subtitle={`MRR estimado ${granularityLabel}${ctxLabel}`}
        iconBg="bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
        loading={loading}
      >
        <ResponsiveContainer minWidth={0} width="100%" height={280}>
          <AreaChart data={revenueSeries} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" />
            <XAxis
              dataKey="bucket"
              stroke="var(--text-tertiary)"
              tick={{ fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              stroke="var(--text-tertiary)"
              tick={{ fontSize: 11, fontWeight: 600 }}
              tickFormatter={(v) => `S/${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--rule-base)",
                borderRadius: 12,
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 600,
              }}
              formatter={((value: number) => [fmtSoles(value), "Ingresos"]) as never}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill="url(#revGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ─── Signups ──────────────────────────────────────────── */}
      <ChartCard
        icon={Users}
        title="Nuevos registros"
        subtitle={`Tenants creados ${granularityLabel}${ctxLabel}`}
        iconBg="bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
        loading={loading}
      >
        <ResponsiveContainer minWidth={0} width="100%" height={240}>
          <BarChart data={signupSeries} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" />
            <XAxis
              dataKey="bucket"
              stroke="var(--text-tertiary)"
              tick={{ fontSize: 11, fontWeight: 600 }}
            />
            <YAxis
              stroke="var(--text-tertiary)"
              tick={{ fontSize: 11, fontWeight: 600 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--rule-base)",
                borderRadius: 12,
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 600,
              }}
              formatter={((value: number) => [value, "Registros"]) as never}
            />
            <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ─── Orders ───────────────────────────────────────────── */}
      {orderSeries.length > 0 && (
        <ChartCard
          icon={ShoppingBag}
          title="Pedidos del marketplace"
          subtitle={`Volumen de órdenes ${granularityLabel}${ctxLabel}`}
          iconBg="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
          loading={loading}
        >
          <ResponsiveContainer minWidth={0} width="100%" height={240}>
            <BarChart data={orderSeries} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" />
              <XAxis
                dataKey="bucket"
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
              />
              <YAxis
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--rule-base)",
                  borderRadius: 12,
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
                formatter={((value: number) => [value, "Pedidos"]) as never}
              />
              <Bar dataKey="count" fill="#ff6b5b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  subtitle,
  iconBg,
  loading,
  children,
}: {
  icon: typeof DollarSign;
  title: string;
  subtitle: string;
  iconBg: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {title}
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>
          </div>
        </div>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" aria-hidden />
        )}
      </header>
      <div className="p-5">{children}</div>
    </div>
  );
}
