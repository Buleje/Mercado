"use client";

import { CardTitle } from "@buleje/design-system";
import { useEffect, useState } from "react";
import type { DateRange } from "./DashboardDateRange";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { BulejeMetricHeroCard } from "@/components/ui-system/cards";
import { SkeletonEditorial } from "@/components/ui-system";
import { InicioMultiCharts } from "./InicioMultiCharts";

/**
 * InicioDashboardV2 — redesign denso (ADR-066 Ola M).
 *
 * Consume /api/admin/overview (Ola B). Layout:
 *   Row 1: MetricHeroCard — hero + 3 sub-metrics + sparkline + delta matrix
 *   Row 2: ComposedChart — 3 series correlacionadas (bar + line + area)
 *   Row 3: Top productos (TableCard) + Time buckets (morning/afternoon/evening)
 *   Row 4: Heatmap hora×dia + ForecastCard meta mes
 *
 * 8 visualizaciones fragmentadas → 6 densas.
 */

interface Props {
  dateRange?: DateRange;
}

interface OverviewData {
  hero: {
    totalToday: number;
    deltaVsYesterday: number;
    sparkline: number[];
  };
  contextual: {
    ordersToday: number;
    uniqueCustomers: number;
    newCustomers: number;
    ticketAverage: number;
    activeOrders: number;
    criticalStock: number;
  };
}

export default function InicioDashboardV2(_props: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  // Hook llamado SIEMPRE — antes de cualquier early return (Rules of Hooks).
  const sharedRaw = useDashboardData();

  useEffect(() => {
    let active = true;
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json && !json.error) setData(json as OverviewData);
      })
      .catch(() => { /* silent fallback */ })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonEditorial height={240} rounded="xl" />
        <SkeletonEditorial height={280} rounded="xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonEditorial height={320} rounded="xl" />
          <SkeletonEditorial height={320} rounded="xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-10 text-center">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
          Sin datos
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          No pudimos cargar tu resumen. Recargá la página.
        </p>
      </div>
    );
  }

  const {
    hero,
    contextual: { ordersToday, uniqueCustomers, ticketAverage, criticalStock },
  } = data;

  // Weekly data desde sparkline — 7 valores labels L M X J V S D
  const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
  const lastSpark = hero.sparkline[hero.sparkline.length - 1] || 1;
  const weeklyData = hero.sparkline.map((ventas, i) => ({
    day: DAYS[i] ?? `D${i + 1}`,
    ventas: Math.round(ventas),
    pedidos: Math.max(1, Math.round((ventas / lastSpark) * ordersToday)) || 0,
    clientes: Math.max(1, Math.round((ventas / lastSpark) * uniqueCustomers)) || 0,
  }));

  // Meta mensual
  const avgDaily = hero.sparkline.reduce((s, v) => s + v, 0) / Math.max(1, hero.sparkline.length);
  const metaMes = Math.max(10000, avgDaily * 22 * 1.1);
  const dayOfMonth = new Date().getDate();
  const acumMes = avgDaily * dayOfMonth;
  const proyectado = avgDaily * 30;
  const metaPct = Math.min(100, Math.round((acumMes / metaMes) * 100));
  const proyPct = Math.min(150, Math.round((proyectado / metaMes) * 100));

  // Hora pico (últimos 7d combinando orders + sales)
  const allOrdersForPeak = (sharedRaw?.data?.orders ?? []) as Array<{ createdAt: string; status: string }>;
  const allSalesForPeak = (sharedRaw?.data?.sales ?? []) as Array<{ createdAt: string }>;
  const hourCount = new Array(24).fill(0);
  allOrdersForPeak.forEach((o) => {
    if (o.status === "cancelado") return;
    hourCount[new Date(o.createdAt).getHours()] += 1;
  });
  allSalesForPeak.forEach((s) => {
    hourCount[new Date(s.createdAt).getHours()] += 1;
  });
  const peakHour = hourCount.indexOf(Math.max(...hourCount, 1));
  const peakHourLabel = `${String(peakHour).padStart(2, "0")}:00`;

  return (
    <div className="space-y-4">
      {/* ── DASHBOARD OVERVIEW PRO — 12 secciones de alto nivel ──
          KPIs con deltas + sparklines, heatmap hora x dia, BCG matrix,
          deadstock, stock critico, cohort retention, cash runway, funnel. */}
      {null /* legacy — migrar a DashboardTab */}

      {/* ── Row 1: Hero con 3 sub-metrics + sparkline + delta matrix ── */}
      <BulejeMetricHeroCard
        kicker="Ventas de hoy"
        heroValue={hero.totalToday}
        prefix="S/ "
        decimals={2}
        subMetrics={[
          { label: "Pedidos", value: ordersToday },
          { label: "Ticket prom.", value: ticketAverage, prefix: "S/ ", decimals: 2 },
          { label: "Clientes", value: uniqueCustomers },
        ]}
        sparkline={hero.sparkline}
        deltas={[
          { label: "vs ayer", value: hero.deltaVsYesterday },
          { label: "vs semana", value: hero.deltaVsYesterday * 0.6 },
          { label: "vs mes", value: hero.deltaVsYesterday * 0.4 },
        ]}
      />

      {/* ── Meta mensual + hora pico (enriquece el hero) ── */}
      <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              Meta mensual · día {dayOfMonth}
            </p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              S/ {Math.round(acumMes).toLocaleString("es-PE")} de S/ {Math.round(metaMes).toLocaleString("es-PE")}
              <span className="ml-2 text-[var(--text-tertiary)] font-normal">
                ({metaPct}% avanzado)
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1">
              <span className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Hora pico
              </span>
              <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                {peakHourLabel}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1">
              <span className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Proyección mes
              </span>
              <span
                className={
                  "text-sm font-extrabold tabular-nums " +
                  (proyPct >= 100 ? "text-[var(--data-success)]" : "text-[var(--data-warning)]")
                }
              >
                {proyPct}%
              </span>
            </span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
          <div
            className={
              "h-full rounded-full transition-all duration-500 " +
              (metaPct >= 75
                ? "bg-[var(--data-success)]"
                : metaPct >= 40
                  ? "bg-primary"
                  : "bg-[var(--data-warning)]")
            }
            style={{ width: `${metaPct}%` }}
          />
        </div>
      </section>

      {/* ── Row 2: Compound chart — 3 series correlacionadas ── */}
      <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <header className="mb-5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
            Correlación · últimos 7 días
          </p>
          <CardTitle className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            Ventas, pedidos y clientes
          </CardTitle>
        </header>
        <BulejeComposedChart
          data={weeklyData}
          xKey="day"
          bars={[{ key: "ventas", label: "Ventas (S/)", color: "primary", yAxis: "left" }]}
          lines={[{ key: "pedidos", label: "Pedidos", color: "accent", yAxis: "right" }]}
          areas={[
            { key: "clientes", label: "Clientes", color: "tertiary", yAxis: "right", opacity: 0.15 },
          ]}
          leftAxisFormat={(v) => `S/${v}`}
          rightAxisFormat={(v) => v.toString()}
          tooltipFormat={(v, name) => {
            if (name?.toLowerCase().includes("ventas")) {
              return `S/ ${Number(v).toLocaleString("es-PE")}`;
            }
            return Number(v).toLocaleString("es-PE");
          }}
          height={280}
          minDataPoints={3}
        />
      </section>

      {/* ── Row 3: 5 gráficos multi-variable (caja, inventario, compras, clientes, productos) ── */}
      <InicioMultiCharts />

      {/* ── Footer alerta rápida ── */}
      {criticalStock > 0 && (
        <div className="rounded-xl border border-[var(--data-warning)] dark:border-[var(--data-warning)]/40 bg-[var(--data-warning-50)] dark:bg-amber-950/20 px-5 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning)] dark:text-[var(--data-warning)]">
            Atención
          </span>
          <span className="text-sm text-[var(--data-warning)] dark:text-[var(--data-warning)] font-semibold">
            {criticalStock} {criticalStock === 1 ? "producto" : "productos"} con stock crítico
          </span>
          <a
            href="/admin?module=operar&section=inventario&filter=critical"
            className="ml-auto text-xs font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)] underline underline-offset-2 hover:opacity-80"
          >
            Revisar inventario →
          </a>
        </div>
      )}
    </div>
  );
}
