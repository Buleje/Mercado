"use client";

import {
  BulejeComposedChart,
  BulejeMultiSeriesLine,
  BulejeStackedBar,
  BulejeComparisonOverlay,
  BulejeRadialProgress,
} from "@/components/ui-system/charts";
import {
  BulejeMetricHeroCard,
  BulejeKPIQuadCard,
  BulejeMetricTableCard,
  BulejeTimeBucketCard,
  BulejeForecastCard,
} from "@/components/ui-system/cards";

/**
 * /design-system/charts-v2 — demo viva de ADR-066 Olas K + L.
 * 5 compound charts + 5 KPI cards multi-signal.
 */
export default function ChartsV2DemoPage() {
  // Mock data 7 dias
  const weeklyData = [
    { day: "L", ventas: 4200, pedidos: 34, clientes: 28 },
    { day: "M", ventas: 5100, pedidos: 42, clientes: 36 },
    { day: "X", ventas: 4800, pedidos: 38, clientes: 32 },
    { day: "J", ventas: 6200, pedidos: 48, clientes: 40 },
    { day: "V", ventas: 8400, pedidos: 62, clientes: 55 },
    { day: "S", ventas: 9800, pedidos: 74, clientes: 68 },
    { day: "D", ventas: 7200, pedidos: 54, clientes: 48 },
  ];

  const multiSeriesData = Array.from({ length: 12 }, (_, i) => {
    const base = 3000 + i * 400;
    return {
      month: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][i],
      thisYear: base + ((i * 137) % 800),
      lastYear: base * 0.8 + ((i * 91) % 600),
      average: base * 0.9,
    };
  });

  const stackedData = [
    { day: "L", abarrotes: 1800, bebidas: 1200, carnes: 600, limpieza: 400 },
    { day: "M", abarrotes: 2100, bebidas: 1400, carnes: 800, limpieza: 500 },
    { day: "X", abarrotes: 1900, bebidas: 1300, carnes: 700, limpieza: 450 },
    { day: "J", abarrotes: 2400, bebidas: 1700, carnes: 900, limpieza: 600 },
    { day: "V", abarrotes: 3200, bebidas: 2400, carnes: 1400, limpieza: 700 },
    { day: "S", abarrotes: 3800, bebidas: 2800, carnes: 1800, limpieza: 800 },
    { day: "D", abarrotes: 2800, bebidas: 2000, carnes: 1300, limpieza: 600 },
  ];

  const comparisonData = weeklyData.map((d, i) => ({
    day: d.day,
    current: d.ventas,
    previous: d.ventas * (0.7 + ((i * 0.05) % 0.3)),
  }));

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Hero */}
      <section
        className="py-16 sm:py-20 border-b border-[var(--rule-base)]"
        style={{ background: "var(--brand-ink)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 mb-4">
            ADR-066 · Olas K + L · v7 dashboards densos
          </p>
          <h1 className="text-fs-display text-white leading-[1.02]">
            Charts v2 <span className="text-white/45">multi-signal</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl">
            5 compound charts (bar+line+area con dual-axis) + 5 KPI cards densos.
            Reemplaza 8 visualizaciones fragmentadas con 6 densas.
          </p>
        </div>
      </section>

      {/* Compound charts */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            01 · BulejeComposedChart (bar + line + area · dual-axis)
          </p>
          <h2 className="text-fs-h2 mb-3">3 métricas correlacionadas en 1 chart</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
            Ventas (bar eje izq S/) + Pedidos (line eje der) + Clientes (area eje der). Antes: 3 charts separados. Ahora: correlación visual inmediata.
          </p>
          <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
            <BulejeComposedChart
              data={weeklyData}
              xKey="day"
              bars={[{ key: "ventas", label: "Ventas (S/)", color: "primary", yAxis: "left" }]}
              lines={[{ key: "pedidos", label: "Pedidos", color: "accent", yAxis: "right" }]}
              areas={[{ key: "clientes", label: "Clientes", color: "tertiary", yAxis: "right", opacity: 0.15 }]}
              leftAxisFormat={(v) => `S/${v}`}
              rightAxisFormat={(v) => v.toString()}
              height={300}
            />
          </section>
        </div>
      </section>

      {/* Multi-series line */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            02 · BulejeMultiSeriesLine (hasta 5 series)
          </p>
          <h2 className="text-fs-h2 mb-6">Comparativa temporal · este año vs pasado vs promedio</h2>
          <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
            <BulejeMultiSeriesLine
              data={multiSeriesData}
              xKey="month"
              series={[
                { key: "thisYear", label: "Este año", color: "primary", strokeWidth: 2, showDots: true },
                { key: "lastYear", label: "Año pasado", color: "tertiary", strokeDasharray: "3 4" },
                { key: "average", label: "Promedio 3y", color: "secondary", opacity: 0.7 },
              ]}
              targetValue={6500}
              targetLabel="Meta mensual S/6.5k"
              yAxisFormat={(v) => `S/${(v / 1000).toFixed(1)}k`}
              height={300}
            />
          </section>
        </div>
      </section>

      {/* Stacked bar */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            03 · BulejeStackedBar
          </p>
          <h2 className="text-fs-h2 mb-6">Ventas × categoría × día (total + breakdown)</h2>
          <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
            <BulejeStackedBar
              data={stackedData}
              xKey="day"
              stacks={[
                { key: "abarrotes", label: "Abarrotes", color: "primary" },
                { key: "bebidas", label: "Bebidas", color: "accent" },
                { key: "carnes", label: "Carnes", color: "amber" },
                { key: "limpieza", label: "Limpieza", color: "info" },
              ]}
              yAxisFormat={(v) => `S/${v}`}
              height={300}
            />
          </section>
        </div>
      </section>

      {/* Comparison overlay */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            04 · BulejeComparisonOverlay
          </p>
          <h2 className="text-fs-h2 mb-6">Esta semana vs semana pasada (con delta total)</h2>
          <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
            <BulejeComparisonOverlay
              data={comparisonData}
              xKey="day"
              currentKey="current"
              previousKey="previous"
              currentLabel="Esta semana"
              previousLabel="Semana pasada"
              yAxisFormat={(v) => `S/${v}`}
            />
          </section>
        </div>
      </section>

      {/* Radial progress */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            05 · BulejeRadialProgress (meta + actual + proyección + ETA)
          </p>
          <h2 className="text-fs-h2 mb-6">4 señales en 1 gauge</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 flex justify-center">
              <BulejeRadialProgress
                actual={6700}
                target={10000}
                projected={8900}
                label="Meta del mes"
                sublabel="Abril · día 17 de 30"
                format={(v) => `S/ ${v.toLocaleString("es-PE")}`}
              />
            </section>
            <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 flex justify-center">
              <BulejeRadialProgress
                actual={4200}
                target={5000}
                projected={5300}
                label="Meta ventas"
                sublabel="Semana actual"
                format={(v) => `S/ ${v.toLocaleString("es-PE")}`}
              />
            </section>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="py-12 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            06 · BulejeMetricHeroCard
          </p>
          <h2 className="text-fs-h2 mb-6">KPI hero con 3 sub-metrics + sparkline + delta matrix</h2>
          <BulejeMetricHeroCard
            kicker="Ventas de hoy"
            heroValue={4520}
            prefix="S/ "
            decimals={2}
            subMetrics={[
              { label: "Pedidos", value: 34 },
              { label: "Ticket prom.", value: 132.9, prefix: "S/ ", decimals: 2 },
              { label: "Clientes", value: 28 },
            ]}
            sparkline={[3200, 4100, 3800, 4600, 5200, 5800, 4520]}
            deltas={[
              { label: "vs ayer", value: 12.5 },
              { label: "vs semana pasada", value: 8.2 },
              { label: "vs mes pasado", value: -2.1 },
            ]}
          />
        </div>
      </section>

      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            07 · BulejeKPIQuadCard (4 KPIs en 1 card)
          </p>
          <h2 className="text-fs-h2 mb-6">Cuatro métricas densas · reemplaza 4 cards separadas</h2>
          <BulejeKPIQuadCard
            kpis={[
              { kicker: "Ventas", value: 18420, prefix: "S/ ", decimals: 2, delta: 12.5, sparkline: [3200, 4100, 3800, 4600, 5200, 5800, 4520] },
              { kicker: "Pedidos", value: 287, delta: -2.1, sparkline: [45, 42, 38, 52, 48, 40, 34] },
              { kicker: "Clientes", value: 142, delta: 28.0, sparkline: [12, 18, 22, 15, 28, 24, 28] },
              { kicker: "Margen", value: 23.4, suffix: "%", decimals: 1, delta: 1.2, sparkline: [21, 22, 21.5, 23, 23.2, 22.8, 23.4] },
            ]}
          />
        </div>
      </section>

      <section className="py-12 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            08 · BulejeMetricTableCard (top rows + sparkline por fila)
          </p>
          <h2 className="text-fs-h2 mb-6">Ranking con trend inline por item</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <BulejeMetricTableCard
              kicker="Top productos"
              sublabel="Últimos 7 días · por volumen"
              rows={[
                { id: "1", label: "Arroz Costeño 5kg", value: 2840, prefix: "S/ ", trend: [20, 24, 22, 28, 32, 30, 35], delta: 18.5 },
                { id: "2", label: "Aceite Primor 1L", value: 1920, prefix: "S/ ", trend: [28, 26, 30, 25, 27, 24, 22], delta: -5.2 },
                { id: "3", label: "Gaseosa Inca Kola 2.25L", value: 1680, prefix: "S/ ", trend: [18, 20, 22, 24, 22, 26, 28], delta: 12.3 },
                { id: "4", label: "Jabón Bolivar x4", value: 1240, prefix: "S/ ", trend: [12, 14, 13, 15, 14, 16, 15], delta: 3.1 },
                { id: "5", label: "Leche Gloria 1L", value: 980, prefix: "S/ ", trend: [10, 11, 12, 11, 13, 12, 14], delta: 8.7 },
              ]}
              viewAllHref="/admin?module=operar"
            />
            <BulejeTimeBucketCard
              kicker="Ventas por franja"
              sublabel="Últimos 7 días"
              prefix="S/ "
              decimals={2}
              buckets={[
                { label: "Mañana", sublabel: "6-12h", value: 4200, color: "data-1" },
                { label: "Tarde", sublabel: "12-19h", value: 8950, color: "data-5" },
                { label: "Noche", sublabel: "19-22h", value: 2180, color: "data-3" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            09 · BulejeForecastCard (actual + proyección + meta + ETA)
          </p>
          <h2 className="text-fs-h2 mb-6">¿Voy a llegar a la meta?</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <BulejeForecastCard
              kicker="Meta del mes"
              sublabel="Abril · día 17 de 30"
              actual={6700}
              projected={11800}
              target={10000}
              prefix="S/ "
              decimals={0}
              sparkline={[3200, 4100, 3800, 4600, 5200, 5800, 6700]}
            />
            <BulejeForecastCard
              kicker="Meta semanal"
              sublabel="Jueves · día 4 de 7"
              actual={2100}
              projected={4200}
              target={5000}
              prefix="S/ "
              decimals={0}
              sparkline={[500, 700, 950, 2100]}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="py-10 text-center">
        <p className="text-xs text-[var(--text-tertiary)]">
          ADR-066 Olas K + L · 5 compound charts + 5 KPI cards · integrado en <code className="ml-2 px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-[length:var(--ts-2xs)]">InicioDashboardV2</code>
        </p>
      </section>
    </main>
  );
}
