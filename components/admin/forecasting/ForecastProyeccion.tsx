"use client";

/**
 * Proyección de la Predicción de ventas: ventas proyectadas de los próximos 7
 * días (panel A) y el top 5 por demanda proyectada (panel D, derivado del
 * reorden). Salió de `ForecastingDashboard.tsx` sin cambios.
 *
 * - `ForecastProyeccionPanel` dibuja con los datos de quien lo monta (el
 *   tablero entero comparte una sola carga y un solo «Actualizar»).
 * - El default se carga solo: pide el pronóstico y el reorden, nada más.
 */

import { TrendingUp, AlertTriangle, Star } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/utils";
import { buildDailyBreakdown } from "./forecast-datos";
import { useForecasting, type Forecasting, type PanelForecast } from "./use-forecasting";
import { MetricChip, PanelCard, TrendBadge } from "./ForecastPiezas";

const PANELES: readonly PanelForecast[] = ["forecast", "reorder"];

export default function ForecastProyeccion() {
  const f = useForecasting(PANELES);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
      <ForecastProyeccionPanel f={f} />
    </div>
  );
}

/** Los paneles A y D como dos celdas de la grilla de quien los monta. */
/**
 * `sinProyeccion` deja sólo el panel D. El panel A proyecta UN producto (el
 * primero de `/api/products?limit=1`) y muestra sus UNIDADES con formato de
 * soles como si fueran «S/ X proyectados en los próximos 7 días» del negocio
 * (`/api/inventory/forecast`: weeklyAvg = cantidad/día × 7). Análisis ›
 * Predicción usa en su lugar el pronóstico del negocio entero
 * (`/api/analytics/predictions`).
 */
export function ForecastProyeccionPanel({ f, sinProyeccion = false }: { f: Forecasting; sinProyeccion?: boolean }) {
  const { state } = f;

  // ── Top 5 productos por demanda proyectada (Panel D) ──────────────────────
  // Derivado de reorder-suggestions: los productos con mayor demandaDuranteLT
  const top5 = [...state.reorder]
    .sort((a, b) => b.demandDuringLeadTime - a.demandDuringLeadTime)
    .slice(0, 5);

  // ── Breakdown de días para el Panel A ─────────────────────────────────────
  const dailyBreakdown = state.forecast ? buildDailyBreakdown(state.forecast) : [];
  const maxRev = dailyBreakdown.length > 0
    ? Math.max(...dailyBreakdown.map((d) => d.rev), 1)
    : 1;

  return (
    <>
        {!sinProyeccion && (
        <>
        {/* ════════════════════════════════════════════════════════════════
            PANEL A — Resumen de ventas proyectadas (7 días)
        ════════════════════════════════════════════════════════════════ */}
        <PanelCard
          icon={<TrendingUp className="w-4 h-4" />}
          title="Ventas Proyectadas — 7 días"
          loading={state.loading}
          error={state.errors.forecast}
          isEmpty={!state.forecast}
          emptyMsg="Presiona Actualizar para ver la predicción"
        >
          {state.forecast && (
            <div className="space-y-6">

              {/* Nota estacional (quincena / feriado) */}
              {state.forecast.seasonalNote && (
                <div className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/30 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/50 p-3">
                  <AlertTriangle className="w-4 h-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5 shrink-0" />
                  <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">
                    {state.forecast.seasonalNote}
                  </p>
                </div>
              )}

              {/* Headline — ingresos proyectados */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    {formatCurrency(state.forecast.weeklyAvg)}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    proyectados en los próximos 7 días
                  </p>
                </div>
                <TrendBadge trend={state.forecast.trend} />
              </div>

              {/* Métricas secundarias */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <MetricChip
                  label="Promedio/dia"
                  value={formatCurrency(state.forecast.dailyAvg)}
                />
                <MetricChip
                  label="Dias de stock"
                  value={state.forecast.daysOfStock >= 999 ? "∞" : `${state.forecast.daysOfStock}d`}
                  danger={state.forecast.daysOfStock < 7}
                />
                <MetricChip
                  label="Punto reorden"
                  value={`${state.forecast.reorderPoint} u.`}
                />
              </div>

              {/* Mini-barras diarias */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">
                  Proyección día a día
                </p>
                <div className="flex items-end gap-1 h-20" role="img" aria-label="Gráfico de barras: proyección semanal">
                  {dailyBreakdown.map((d, i) => {
                    const pct = maxRev > 0 ? (d.rev / maxRev) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        {/* Valor sobre la barra */}
                        <span className="text-xs text-[var(--text-tertiary)] font-medium hidden sm:block">
                          {formatCurrency(d.rev).replace("S/ ", "")}
                        </span>
                        {/* Barra */}
                        <div className="w-full relative" style={{ height: "44px" }}>
                          <div
                            className="absolute bottom-0 left-0 right-0 rounded-t-md bg-primary/10 dark:bg-primary/10 transition-all duration-[var(--dur-slow)]"
                            style={{ height: `${Math.max(pct, 6)}%` }}
                          />
                        </div>
                        {/* Nombre del día */}
                        <span className="text-xs font-bold text-[var(--text-secondary)] ">
                          {d.dia}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </PanelCard>
        </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PANEL D — Top 5 productos por demanda proyectada
        ════════════════════════════════════════════════════════════════ */}
        <PanelCard
          icon={<Star className="w-4 h-4" />}
          title="Top 5 por demanda"
          loading={state.loading}
          error={state.errors.reorder}
          isEmpty={state.reorder.length === 0 && !state.loading && !state.errors.reorder}
          emptyMsg="Sin datos de demanda disponibles"
        >
          {top5.length > 0 && (
            <ol className="space-y-2">
              {top5.map((item, idx) => {
                const maxDemand = top5[0]?.demandDuringLeadTime ?? 1;
                const pct = maxDemand > 0 ? (item.demandDuringLeadTime / maxDemand) * 100 : 0;
                const medal = [`1°`, `2°`, `3°`, "4°", "5°"][idx];
                return (
                  <li key={item.productId} className="flex items-center gap-3">
                    {/* Posición */}
                    <span className="w-7 text-center text-sm font-bold text-[var(--text-secondary)] shrink-0">
                      {medal}
                    </span>
                    {/* Nombre + barra */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {item.productName}
                      </p>
                      <div className="mt-1 h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)] transition-all duration-[var(--dur-slow)]"
                          style={{ width: `${Math.max(pct, 6)}%` }}
                        />
                      </div>
                    </div>
                    {/* Demanda */}
                    <span className="text-sm font-bold text-[var(--text-primary)] shrink-0">
                      {item.demandDuringLeadTime} u.
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </PanelCard>
    </>
  );
}
