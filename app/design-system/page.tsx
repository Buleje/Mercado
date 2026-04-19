"use client";

import {
  BulejeGaugeChart,
  BulejeSparklineKPICard,
  BulejeHeatmap,
  BulejeFunnelChart,
  BulejeWaterfallChart,
  BulejeCohortTable,
  BulejeLineChart,
  BulejeBarChart,
  BulejeDonutChart,
  BulejeSparkline,
} from "@/components/ui-system/charts";
import {
  SkeletonEditorial,
  SkeletonProductCard,
  SkeletonKPICard,
  SkeletonList,
  Canasta,
  Olla,
  Pesa,
  BolsaDelivery,
  RecetarioOpen,
  CuadernoFiado,
  HuellaCliente,
  MapaUcayali,
  BilleteSoles,
  TanqueGas,
  NodosRed,
  CursoGrafico,
  BulejeMark,
  JungleLeaf,
  DeliveryMoto,
  RecipePot,
  CoinStack,
  TrendLine,
  DocumentContract,
  RiverCurve,
} from "@/components/ui-system";

/**
 * /superadmin/design-system — showcase viva del Brand System v4.
 *
 * Referencia interactiva para los 20 iconos custom, 12 charts, 8 motion
 * presets y todos los tokens del sistema. Solo accesible para superadmin.
 */
export default function DesignSystemPage() {
  // Datos mock para los charts
  const weeklyRevenue = [
    { x: "L", v: 1200 },
    { x: "M", v: 1450 },
    { x: "X", v: 980 },
    { x: "J", v: 1650 },
    { x: "V", v: 2100 },
    { x: "S", v: 2400 },
    { x: "D", v: 1800 },
  ];

  // Deterministic mock data (no Math.random — evita purity rule de React 19)
  const heatmapData = Array.from({ length: 7 * 24 }, (_, i) => ({
    day: Math.floor(i / 24),
    hour: i % 24,
    value:
      i % 24 >= 7 && i % 24 <= 22
        ? ((i * 17 + 5) % 100) + (i % 24 === 13 || i % 24 === 19 ? 80 : 0)
        : (i * 7) % 15,
  }));

  const funnelStages = [
    { label: "Visitas al marketplace", value: 10234 },
    { label: "Vieron producto", value: 4521 },
    { label: "Agregaron al carrito", value: 1240 },
    { label: "Iniciaron checkout", value: 420 },
    { label: "Completaron pedido", value: 287 },
  ];

  const waterfallSteps = [
    { label: "Inicio", value: 0, type: "baseline" as const },
    { label: "Ventas", value: 28500, type: "positive" as const },
    { label: "Insumos", value: -9200, type: "negative" as const },
    { label: "Sueldos", value: -6400, type: "negative" as const },
    { label: "Alquiler", value: -2800, type: "negative" as const },
    { label: "Utilidad", value: 10100, type: "total" as const },
  ];

  const cohorts = [
    { label: "Ene 2026", size: 120, retention: [100, 68, 45, 32, 28] },
    { label: "Feb 2026", size: 180, retention: [100, 72, 52, 38, null] },
    { label: "Mar 2026", size: 240, retention: [100, 78, 58, null, null] },
    { label: "Abr 2026", size: 310, retention: [100, 82, null, null, null] },
  ];

  const allIcons = [
    { name: "BulejeMark", Icon: BulejeMark },
    { name: "JungleLeaf", Icon: JungleLeaf },
    { name: "DeliveryMoto", Icon: DeliveryMoto },
    { name: "RecipePot", Icon: RecipePot },
    { name: "CoinStack", Icon: CoinStack },
    { name: "TrendLine", Icon: TrendLine },
    { name: "DocumentContract", Icon: DocumentContract },
    { name: "RiverCurve", Icon: RiverCurve },
    { name: "Canasta", Icon: Canasta },
    { name: "Olla", Icon: Olla },
    { name: "Pesa", Icon: Pesa },
    { name: "BolsaDelivery", Icon: BolsaDelivery },
    { name: "RecetarioOpen", Icon: RecetarioOpen },
    { name: "CuadernoFiado", Icon: CuadernoFiado },
    { name: "HuellaCliente", Icon: HuellaCliente },
    { name: "MapaUcayali", Icon: MapaUcayali },
    { name: "BilleteSoles", Icon: BilleteSoles },
    { name: "TanqueGas", Icon: TanqueGas },
    { name: "NodosRed", Icon: NodosRed },
    { name: "CursoGrafico", Icon: CursoGrafico },
  ];

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Hero */}
      <section
        className="py-20 sm:py-28 border-b border-[var(--rule-base)]"
        style={{ background: "var(--brand-ink)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/55 mb-4">
            Brand System v4 · 7 olas completadas
          </p>
          <h1 className="text-fs-display text-white leading-[1.02]">
            Design System <span className="text-white/45">Buleje</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl">
            Referencia viva: tokens, 20 iconos custom, 12 gráficos editoriales,
            9 UX primitives, copywriting psicológico y a11y WCAG 2.2 AA. Todo importable desde
            <code className="mx-2 px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-xs">@/components/ui-system</code>.
          </p>

          {/* Nav a demos especificas */}
          <nav className="mt-8 flex flex-wrap gap-2" aria-label="Demos del design system">
            <a href="#charts" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-bold text-white transition-colors">
              01 · Data viz
            </a>
            <a href="/design-system/admin" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-bold text-white transition-colors">
              02 · Admin UX →
            </a>
            <a href="/design-system/customer" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-bold text-white transition-colors">
              03 · Customer journey →
            </a>
            <a href="/design-system/a11y" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-bold text-white transition-colors">
              04 · A11y + Perf →
            </a>
          </nav>

          <div id="charts" className="mt-8 grid grid-cols-4 gap-0 border-y border-white/10 py-6 max-w-2xl">
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">20</p>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/45 mt-2">Iconos</p>
            </div>
            <div className="border-l border-white/10 pl-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">12</p>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/45 mt-2">Charts</p>
            </div>
            <div className="border-l border-white/10 pl-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">6</p>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/45 mt-2">Motion curves</p>
            </div>
            <div className="border-l border-white/10 pl-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">14</p>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/45 mt-2">Primitives</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI Cards ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              01 · KPI cards
            </p>
            <h2 className="text-fs-h1">BulejeSparklineKPICard</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Tarjetas KPI con NumberFlow animado, delta % y sparkline integrado.
            </p>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <BulejeSparklineKPICard
              label="Ventas hoy"
              value={4520}
              prefix="S/ "
              delta={12.5}
              deltaLabel="vs ayer"
              trend={[100, 120, 98, 140, 160, 155, 180]}
            />
            <BulejeSparklineKPICard
              label="Pedidos"
              value={287}
              delta={-4.2}
              deltaLabel="vs semana pasada"
              trend={[45, 42, 38, 35, 40, 38, 28]}
            />
            <BulejeSparklineKPICard
              label="Clientes nuevos"
              value={34}
              delta={28.1}
              deltaLabel="vs mes pasado"
              trend={[5, 8, 12, 9, 15, 18, 34]}
            />
            <BulejeSparklineKPICard
              label="Ticket promedio"
              value={47.8}
              prefix="S/ "
              decimals={2}
              delta={0}
              deltaLabel="sin cambio"
              trend={[48, 47, 48, 47, 48, 47, 48]}
            />
          </div>
        </div>
      </section>

      {/* ── Gauge + Donut ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              02 · Progreso + composición
            </p>
            <h2 className="text-fs-h1">Gauge + Donut</h2>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 flex flex-col items-center justify-center">
              <BulejeGaugeChart
                value={67}
                label="Meta del mes"
                sublabel="S/ 6,700 / S/ 10,000"
                format="percentage"
              />
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 flex flex-col items-center justify-center">
              <BulejeGaugeChart
                value={82}
                label="Satisfacción NPS"
                sublabel="27 encuestas"
                format="percentage"
              />
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 flex flex-col items-center justify-center">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
                Mix de categorías
              </p>
              <BulejeDonutChart
                data={[
                  { name: "Abarrotes", value: 42 },
                  { name: "Bebidas", value: 28 },
                  { name: "Limpieza", value: 18 },
                  { name: "Otros", value: 12 },
                ]}
                label={
                  <div className="text-center">
                    <p className="text-3xl font-extrabold tabular-nums tracking-tight">100%</p>
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mt-1">Total</p>
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Line + Bar ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              03 · Tendencias
            </p>
            <h2 className="text-fs-h1">Line + Bar</h2>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">
                Ventas semanales
              </p>
              <h3 className="text-base font-extrabold tracking-tight mb-4">
                Últimos 7 días
              </h3>
              <BulejeLineChart
                data={weeklyRevenue}
                xKey="x"
                series={[{ key: "v", label: "Ventas" }]}
                height={220}
                format={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`}
              />
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">
                Órdenes por día
              </p>
              <h3 className="text-base font-extrabold tracking-tight mb-4">
                Últimos 7 días
              </h3>
              <BulejeBarChart
                data={weeklyRevenue}
                xKey="x"
                series={[{ key: "v", label: "Órdenes" }]}
                height={220}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Heatmap ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              04 · Patrones
            </p>
            <h2 className="text-fs-h1">Heatmap hora/día</h2>
          </header>
          <BulejeHeatmap
            data={heatmapData}
            label="Actividad"
            sublabel="Ventas por hora y día — últimos 30 días"
            valueFormat={(v) => `${v} ventas`}
          />
        </div>
      </section>

      {/* ── Funnel ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              05 · Conversión
            </p>
            <h2 className="text-fs-h1">Funnel</h2>
          </header>
          <BulejeFunnelChart
            stages={funnelStages}
            label="Marketplace"
            sublabel="Conversión de visita a compra"
          />
        </div>
      </section>

      {/* ── Waterfall + Cohort ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              06 · Flujo financiero + retención
            </p>
            <h2 className="text-fs-h1">Waterfall + Cohort</h2>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BulejeWaterfallChart
              steps={waterfallSteps}
              label="Mes de abril"
              sublabel="Flujo de caja"
              currency="S/"
              height={280}
            />
            <BulejeCohortTable
              cohorts={cohorts}
              periodLabels={["M0", "M1", "M2", "M3", "M4"]}
              label="Retención clientes"
              sublabel="% que volvió a comprar"
            />
          </div>
        </div>
      </section>

      {/* ── Sparklines ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              07 · Micrométricas
            </p>
            <h2 className="text-fs-h1">Sparklines</h2>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { name: "Up", data: [10, 12, 15, 18, 22, 28, 35], trend: "up" as const },
              { name: "Down", data: [35, 30, 28, 22, 18, 15, 10], trend: "down" as const },
              { name: "Flat", data: [20, 22, 19, 21, 20, 21, 20], trend: "neutral" as const },
              { name: "Accent", data: [10, 18, 14, 22, 20, 28, 24], trend: "neutral" as const },
            ].map((s) => (
              <div key={s.name} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
                  {s.name}
                </p>
                <BulejeSparkline data={s.data} trend={s.trend} width={200} height={50} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Skeletons ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              08 · Loading states
            </p>
            <h2 className="text-fs-h1">Skeletons v4</h2>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <SkeletonKPICard />
            <SkeletonProductCard />
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-3">
              <SkeletonEditorial variant="title" />
              <SkeletonEditorial variant="text" />
              <SkeletonEditorial variant="text" width="80%" />
              <SkeletonEditorial variant="text" width="60%" />
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 flex items-center gap-3">
              <SkeletonEditorial variant="avatar" />
              <div className="flex-1 space-y-2">
                <SkeletonEditorial variant="text" width="50%" />
                <SkeletonEditorial variant="caption" width="40%" />
              </div>
            </div>
          </div>
          <SkeletonList count={3} />
        </div>
      </section>

      {/* ── Icons ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              09 · Icon set Buleje v4
            </p>
            <h2 className="text-fs-h1">20 iconos custom</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              SVG line-art, strokeWidth 1.5, color currentColor. Importables desde <code className="mx-0.5 px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-xs">@/components/ui-system</code>.
            </p>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {allIcons.map((i) => {
              const IconComp = i.Icon;
              return (
                <div
                  key={i.name}
                  className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 flex flex-col items-center gap-3 hover:border-[var(--rule-strong)] transition-colors"
                >
                  <div className="h-12 w-12 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-primary)]">
                    <IconComp className="h-6 w-6" strokeWidth={1.5} />
                  </div>
                  <p className="text-[length:var(--ts-2xs)] font-mono tabular-nums text-[var(--text-tertiary)] text-center leading-tight">
                    {i.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Tokens ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              10 · Tokens de color
            </p>
            <h2 className="text-fs-h1">Paleta 60-30-10</h2>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { name: "surface-canvas", cssVar: "--surface-canvas" },
              { name: "surface-sunken", cssVar: "--surface-sunken" },
              { name: "surface-raised", cssVar: "--surface-raised" },
              { name: "brand-ink", cssVar: "--brand-ink" },
              { name: "text-primary", cssVar: "--text-primary" },
              { name: "text-secondary", cssVar: "--text-secondary" },
              { name: "text-tertiary", cssVar: "--text-tertiary" },
              { name: "rule-soft", cssVar: "--rule-soft" },
              { name: "rule-base", cssVar: "--rule-base" },
              { name: "brand-accent", cssVar: "--brand-accent" },
              { name: "data-1", cssVar: "--data-1" },
              { name: "data-2", cssVar: "--data-2" },
              { name: "data-3", cssVar: "--data-3" },
              { name: "data-4", cssVar: "--data-4" },
              { name: "data-5", cssVar: "--data-5" },
              { name: "data-6", cssVar: "--data-6" },
              { name: "data-7", cssVar: "--data-7" },
              { name: "data-8", cssVar: "--data-8" },
            ].map((t) => (
              <div
                key={t.name}
                className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
              >
                <div
                  className="h-16 w-full border-b border-[var(--rule-soft)]"
                  style={{ background: `var(${t.cssVar})` }}
                />
                <div className="p-2">
                  <p className="text-[length:var(--ts-2xs)] font-mono tabular-nums text-[var(--text-primary)]">{t.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Typography ── */}
      <section className="py-16 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <header className="mb-8">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
              11 · Tipografía
            </p>
            <h2 className="text-fs-h1">Escala fluid clamp()</h2>
          </header>
          <div className="space-y-6">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">text-fs-display</p>
              <p className="text-fs-display">Titular hero.</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">text-fs-h1</p>
              <p className="text-fs-h1">Title de página.</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">text-fs-h2</p>
              <p className="text-fs-h2">Section title.</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">text-fs-h3</p>
              <p className="text-fs-h3">Card title.</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">text-kpi</p>
              <p className="text-kpi text-5xl text-[var(--text-primary)]">45,123</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-[var(--text-tertiary)]">
            ADR-062 Brand System v4 · Ola 1 + 2 completadas
          </p>
        </div>
      </section>
    </main>
  );
}
