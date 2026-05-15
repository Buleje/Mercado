"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "./DashboardDateRange";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { CardTitle } from "@buleje/design-system";
import { DashboardAlertsList } from "@/components/admin/hoy/TodayHub";
// BulejeMetricHeroCard removido (duplicado con TodayHub). Re-importar si se
// restaura el hero en esta pantalla.
import { SkeletonEditorial } from "@/components/ui-system";
import { InicioMultiCharts } from "./InicioMultiCharts";
import EmptyDateRangeState from "./EmptyDateRangeState";

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
  onChangeRange?: (r: DateRange) => void;
}

interface OverviewData {
  hero: {
    totalToday: number;           // legacy
    totalRange?: number;
    deltaVsYesterday: number;     // legacy
    deltaVsPrevious?: number;
    sparkline: number[];
    sparklineLabels?: string[];
  };
  contextual: {
    ordersToday: number;
    ordersInRange?: number;
    uniqueCustomers: number;
    newCustomers: number;
    ticketAverage: number;
    activeOrders: number;
    criticalStock: number;
  };
}

// PRESET_HERO y PRESET_DELTA removidos (2026-04-24) — solo los usaba el hero
// duplicado con TodayHub que tambien fue removido. Si se restaura el hero,
// volver a declararlos aqui (estaban con las 5 variantes: diario/semanal/
// mensual/anual/personalizado).
// PRESET_CORRELATION removido — header inline eliminado en Row 2.
const PRESET_META_LABEL: Record<string, string> = {
  diario: "Meta del día",
  semanal: "Meta de la semana",
  mensual: "Meta del mes",
  anual: "Meta del año",
  personalizado: "Meta del período",
};
const PRESET_PROYECCION: Record<string, string> = {
  diario: "Proyección hoy",
  semanal: "Proyección semana",
  mensual: "Proyección mes",
  anual: "Proyección año",
  personalizado: "Proyección período",
};

export default function InicioDashboardV2({ dateRange, onChangeRange }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  // Hook llamado SIEMPRE — antes de cualquier early return (Rules of Hooks).
  const sharedRaw = useDashboardData();
  // Date.now() via useRef lazy-init — evita react-hooks/purity violation
  // (Date.now es impure en render body). El ref se setea UNA vez al mount
  // y es estable para fallback de daysInRange calculation.
  const nowRef = useRef<number | null>(null);
  // eslint-disable-next-line react-hooks/purity -- lazy-init estable, solo 1ra render
  if (nowRef.current === null) nowRef.current = Date.now();
  // dayOfMonth idem — estable dentro del lifecycle del componente.
  const dayOfMonthRef = useRef<number | null>(null);
  // eslint-disable-next-line react-hooks/purity -- lazy-init estable, solo 1ra render
  if (dayOfMonthRef.current === null) dayOfMonthRef.current = new Date().getDate();

  const rangeQuery = useMemo(() => {
    if (!dateRange) return "";
    const params = new URLSearchParams();
    params.set("from", dateRange.from.toISOString());
    params.set("to", dateRange.to.toISOString());
    params.set("preset", dateRange.preset);
    return `?${params.toString()}`;
  }, [dateRange?.from, dateRange?.to, dateRange?.preset]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/overview${rangeQuery}`)
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
  }, [rangeQuery]);

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

  const presetKey = dateRange?.preset ?? "diario";
  const rangeTxt =
    presetKey === "diario" ? "hoy"
    : presetKey === "semanal" ? "esta semana"
    : presetKey === "mensual" ? "este mes"
    : presetKey === "anual" ? "este año"
    : "del período";
  // ticketAverage y heroDelta quedaron huerfanos tras remover el hero duplicado;
  // uniqueCustomers sigue en uso (weeklyData.clientes abajo).
  const { hero, contextual: { uniqueCustomers, criticalStock } } = data;
  const ordersInRange = data.contextual.ordersInRange ?? data.contextual.ordersToday ?? 0;
  const heroValue = hero.totalRange ?? hero.totalToday ?? 0;

  // Empty state: todo en cero en el rango — más útil que charts vacíos.
  if (heroValue === 0 && ordersInRange === 0 && uniqueCustomers === 0 && dateRange) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="actividad"
        onChangeRange={onChangeRange}
        action={{ label: "Registrar venta", href: "/admin?tab=ventas-caja" }}
      />
    );
  }

  // Weekly data desde sparkline — labels dinámicos según rango
  const lastSpark = hero.sparkline[hero.sparkline.length - 1] || 1;
  const sparkLabels = hero.sparklineLabels ?? [];
  const weeklyData = hero.sparkline.map((ventas, i) => ({
    day: sparkLabels[i] ?? `${i + 1}`,
    ventas: Math.round(ventas),
    pedidos: Math.max(1, Math.round((ventas / lastSpark) * ordersInRange)) || 0,
    clientes: Math.max(1, Math.round((ventas / lastSpark) * uniqueCustomers)) || 0,
  }));

  // Meta proyectada según preset activo
  const avgDaily = hero.sparkline.reduce((s, v) => s + v, 0) / Math.max(1, hero.sparkline.length);
  // `nowRef` y `dayOfMonthRef` se inicializaron al tope del componente (puro).
  const now = nowRef.current ?? 0;
  const toMs = dateRange?.to?.getTime() ?? now;
  const fromMs = dateRange?.from?.getTime() ?? now;
  const daysInRange = Math.max(1, Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1);
  const dayOfMonth = dayOfMonthRef.current ?? 1;
  // Target: 10% sobre promedio diario × días del rango, con piso mínimo 10k (mensual) / 300 (diario)
  const metaFloor = presetKey === "diario" ? 300 : presetKey === "semanal" ? 2500 : presetKey === "anual" ? 120000 : 10000;
  const metaRango = Math.max(metaFloor, avgDaily * daysInRange * 1.1);
  // Acumulado real = totalRange del backend (no simulado)
  const acumRango = heroValue;
  // Proyección: extrapola el promedio diario al rango completo
  const proyectado = avgDaily * daysInRange;
  const metaPct = Math.min(100, Math.round((acumRango / metaRango) * 100));
  const proyPct = Math.min(150, Math.round((proyectado / metaRango) * 100));

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

      {/* ── Row 1 (REMOVIDO 2026-04-24): hero duplicado ──
          TodayHub arriba ya renderiza el mismo kicker "Ventas del mes" +
          heroValue + sparkline + deltas. Mantener 2 heros idénticos era
          ruido visual sin aporte informativo. Los sub-metrics (Pedidos,
          Ticket prom., Clientes) quedan cubiertos por las KPI cards de
          las siguientes secciones. */}

      {/* ── Meta + Alertas accionables side-by-side ──
          Brandon mayo 2026 v2: en lugar de banda Meta full-width + bloque
          de Alertas separado en TodayHub, ambos van en 1 fila grid 2-col.
          Lectura más rápida del estado del negocio. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
                {PRESET_META_LABEL[presetKey] ?? PRESET_META_LABEL.mensual}
                {presetKey === "mensual" && ` · día ${dayOfMonth}`}
              </p>
              <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tabular-nums leading-tight">
                S/ {Math.round(acumRango).toLocaleString("es-PE")}
                <span className="text-[var(--text-tertiary)] font-semibold"> / </span>
                S/ {Math.round(metaRango).toLocaleString("es-PE")}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)] font-semibold">
                {metaPct}% avanzado
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1.5">
                <span className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Hora pico
                </span>
                <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                  {peakHourLabel}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1.5">
                <span className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {PRESET_PROYECCION[presetKey] ?? PRESET_PROYECCION.mensual}
                </span>
                <span
                  className={
                    "text-sm font-extrabold tabular-nums " +
                    (proyPct >= 100 ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]")
                  }
                >
                  {proyPct}%
                </span>
              </span>
            </div>
          </div>
          <div className="mt-auto h-3 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
            <div
              className={
                "h-full rounded-full transition-all duration-500 " +
                (metaPct >= 75
                  ? "bg-[var(--data-success-500)]"
                  : metaPct >= 40
                    ? "bg-primary"
                    : "bg-[var(--data-warning-500)]")
              }
              style={{ width: `${metaPct}%` }}
            />
          </div>
        </section>

        <DashboardAlertsList dateRange={dateRange} />
      </div>

      {/* ── Row 2: Compound chart — 3 series correlacionadas (ventas + pedidos + clientes)
          Brandon mayo 2026 v2: header restaurado con título plain-spanish para
          que el dueño de la bodega entienda de un vistazo qué mide el gráfico. */}
      <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <header className="mb-5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
            Ventas · {rangeTxt}
          </p>
          <CardTitle className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
            Cuánto vendiste, cuántos pedidos y cuántos clientes te compraron
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
          showValues
          valueFormat={(v) => (v >= 1000 ? `S/${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : `S/${v}`)}
        />
      </section>

      {/* ── Row 3: 5 gráficos multi-variable (caja, inventario, compras, clientes, productos) ── */}
      <InicioMultiCharts dateRange={dateRange} />

      {/* ── Footer alerta rápida ── */}
      {criticalStock > 0 && (
        <div className="rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-amber-950/20 px-5 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
            Atención
          </span>
          <span className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-semibold">
            {criticalStock} {criticalStock === 1 ? "producto" : "productos"} con stock crítico
          </span>
          <a
            href="/admin?module=operar&section=inventario&filter=critical"
            className="ml-auto text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] underline underline-offset-2 hover:opacity-80"
          >
            Revisar inventario →
          </a>
        </div>
      )}
    </div>
  );
}
