"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "./DashboardDateRange";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { CardTitle } from "@buleje/design-system";
import { DashboardAlertsList } from "@/components/admin/hoy/TodayHub";
import { useChartRegistration } from "@/lib/admin/charts-visibility";
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
    sparklineIso?: string[];
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
  // Brandon 2026-05-16 (audit P1): estado separado para errores de red /
  // 500 server. Antes el catch silencioso dejaba `data=null` que el empty
  // state interpretaba como "sin ventas" — el bodeguero veía "Registrar
  // venta" en lugar de un banner de error real.
  const [fetchError, setFetchError] = useState<string | null>(null);
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
    // Brandon 2026-05-16 (audit P1): agregado AbortController para
    // cancelar fetches en vuelo cuando el usuario cambia el rango
    // rápidamente. Antes el flag `active` evitaba el setState post-unmount
    // pero el fetch igual viajaba a la red — múltiples fetches consumían
    // BW/CPU innecesariamente.
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/admin/overview${rangeQuery}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          setFetchError(`Error del servidor (${r.status}). Reintentá en unos segundos.`);
          return null;
        }
        return r.json();
      })
      .then((json) => {
        if (!active) return;
        if (json && !json.error) {
          setData(json as OverviewData);
        } else if (json?.error) {
          setFetchError(typeof json.error === "string" ? json.error : "Respuesta inválida.");
        }
      })
      .catch((err) => {
        if (!active || err?.name === "AbortError") return;
        setFetchError("Error de red. Verificá tu conexión.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
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

  // Brandon 2026-05-16 (audit P1): diferenciar error de red vs "sin datos".
  // Antes ambos casos caían al mismo banner gris → el bodeguero no sabía
  // si reintentar o llamar a soporte.
  if (fetchError) {
    return (
      <div className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 p-6 text-center">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--data-error-500)] mb-2">
          No se pudo cargar el resumen
        </p>
        <p className="text-sm font-semibold text-[var(--text-primary)] mb-4">
          {fetchError}
        </p>
        <button
          type="button"
          onClick={() => { setFetchError(null); setLoading(true); /* effect re-corre por cambio en setLoading? no — uso reload */ window.location.reload(); }}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[var(--data-error-500)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity"
        >
          Reintentar
        </button>
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

  // Weekly data desde sparkline — labels dinámicos según rango.
  // Brandon mayo 2026 v3: iso propagado del API (sparklineIso) para que el
  // tooltip muestre "Domingo 2 de mayo" en lugar de "01 May".
  //
  // Brandon 2026-05-16 (audit P1): fix math fake. Antes
  //   pedidos[i] = (ventas[i] / lastSpark) * ordersInRange
  // donde lastSpark era el ÚLTIMO valor del sparkline. Si el último día
  // estaba en 0, fallback a 1 → produced 15000 pedidos para una bodega
  // con 3 pedidos reales en el rango. Bug verificado por code-reviewer.
  // Ahora: distribución proporcional sobre el TOTAL del sparkline.
  // Si sumSpark === 0 (sin ventas en el rango), pedidos/clientes = 0.
  const sumSpark = hero.sparkline.reduce((s, v) => s + v, 0);
  const sparkLabels = hero.sparklineLabels ?? [];
  const sparkIso = hero.sparklineIso ?? [];
  const weeklyData = hero.sparkline.map((ventas, i) => ({
    day: sparkLabels[i] ?? `${i + 1}`,
    iso: sparkIso[i] ?? "",
    ventas: Math.round(ventas),
    pedidos: sumSpark > 0 ? Math.round((ventas / sumSpark) * ordersInRange) : 0,
    clientes: sumSpark > 0 ? Math.round((ventas / sumSpark) * uniqueCustomers) : 0,
  }));

  // Meta proyectada según preset activo
  const avgDaily = hero.sparkline.reduce((s, v) => s + v, 0) / Math.max(1, hero.sparkline.length);
  // `nowRef` y `dayOfMonthRef` se inicializaron al tope del componente (puro).
  const now = nowRef.current ?? 0;
  const toMs = dateRange?.to?.getTime() ?? now;
  const fromMs = dateRange?.from?.getTime() ?? now;
  const daysInRange = Math.max(1, Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1);
  const dayOfMonth = dayOfMonthRef.current ?? 1;
  // Meta: 20% sobre proyección realista del promedio diario × días del rango.
  // Brandon mayo 2026 v5: removido el piso fijo (S/10k mensual, S/300 diario,
  // etc.) que generaba metas imposibles ("5% avanzado" con S/10k cuando el
  // negocio vendía S/32/día). Ahora la meta se basa en la realidad del negocio:
  // promedio diario actual × días × 1.2 (stretch de 20%). Si el promedio es
  // cero, usamos un piso mínimo bajo de S/30/día para que la barra exista.
  const dailyBaseline = Math.max(avgDaily, 30);
  const metaRango = dailyBaseline * daysInRange * 1.2;
  // Acumulado real = totalRange del backend (no simulado)
  const acumRango = heroValue;
  // Proyección: extrapola el promedio diario al rango completo
  const proyectado = avgDaily * daysInRange;
  const metaPct = Math.min(100, Math.round((acumRango / metaRango) * 100));
  const proyPct = Math.min(150, Math.round((proyectado / metaRango) * 100));

  // Hora pico (últimos 7d combinando orders + sales).
  // Brandon mayo 2026 v5: ocultar la pill cuando no hay info real. Antes
  // mostraba "00:00" si no había datos o si todos los eventos tenían hora
  // 00:00 (bug timezone) — confundía al dueño ("¿la gente compra a
  // medianoche?"). Ahora solo aparece si hay >= 5 eventos y el pico no
  // está concentrado únicamente en medianoche.
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
  const totalPeakEvents = hourCount.reduce((a, b) => a + b, 0);
  const peakHour = hourCount.indexOf(Math.max(...hourCount, 1));
  // Si el pico cae en 00:00 lo tratamos como ruido — ninguna bodega tiene
  // pico real a medianoche en Perú; suele ser bug de timezone en el seed o
  // datos con createdAt sin hora real. Tampoco mostramos la pill si hay
  // menos de 5 eventos (muestra muy chica para llamar a algo "hora pico").
  const hasMeaningfulPeak = totalPeakEvents >= 5 && peakHour !== 0;
  const peakHourLabel = hasMeaningfulPeak ? `${String(peakHour).padStart(2, "0")}:00` : null;

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
              {peakHourLabel && (
                <span className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Hora pico
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                    {peakHourLabel}
                  </span>
                </span>
              )}
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

      {/* ── Row 2: Compound chart — 3 series correlacionadas (ventas + pedidos + clientes) */}
      <ResumenVentasSection weeklyData={weeklyData} rangeTxt={rangeTxt} />

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

// ── Row 2 extraído a componente con visibility registration ───────────────
// Brandon mayo 2026: extraído para registrar el chart en el sistema de
// visibility (botón "Gráficos"). Se oculta si el usuario lo apaga desde el
// modal o si no tiene datos (todas las ventas son 0).

interface ResumenVentasSectionProps {
  weeklyData: Array<{ day: string; iso?: string; ventas: number; pedidos: number; clientes: number }>;
  rangeTxt: string;
}

function ResumenVentasSection({ weeklyData, rangeTxt }: ResumenVentasSectionProps) {
  const hasData = weeklyData.length >= 3 && weeklyData.some((d) => d.ventas > 0);
  const { visible } = useChartRegistration("resumen.ventas-pedidos-clientes", {
    label: "Cuánto vendiste, cuántos pedidos y cuántos clientes te compraron",
    hasData,
  });
  if (!visible) return null;

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <header className="mb-5">
        <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
          Ventas · {rangeTxt}
        </p>
        <CardTitle className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          Cuánto vendiste, cuántos pedidos y cuántos clientes te compraron
        </CardTitle>
        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed font-medium">
          Barras negras = plata que entró cada día. Línea = pedidos que recibiste. Área celeste = clientes únicos. Cuando las 3 suben juntas tu negocio crece sano; cuando solo sube la plata pero los clientes caen, dependés de pocos compradores.
        </p>
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
        height={300}
        minDataPoints={3}
        showValues
        valueFormat={(v) => (v >= 1000 ? `S/${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : `S/${v}`)}
      />
    </section>
  );
}
