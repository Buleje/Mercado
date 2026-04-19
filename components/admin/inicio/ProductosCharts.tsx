"use client";

/**
 * ProductosCharts — pattern unificado:
 *  - Row 2 (FULL): Top 20 productos por ingresos (BarChart horizontal)
 *  - Row 3: Pareto ABC + Productos sin movimiento
 *  - Row 4: MicroDonut categoria + MicroList margenes altos + MicroGauge cobertura cat
 */

import {
  BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  BarChart3, Target, Package, ShoppingBasket, Link2, Layers, TrendingUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ProductosData } from "./ProductosDashboard";
import {
  ChartCard, ChartTooltip, CHART_TOKENS,
  MicroDonut, MicroList, MicroGauge,
} from "./_shared";

const T = CHART_TOKENS;

export default function ProductosCharts({ data }: { data: ProductosData }) {
  // Categorias para donut
  const categoriasData = data.ventasPorCategoria.map((c) => ({
    name: c.nombre, value: c.total, color: c.color,
  }));

  // Top 5 productos por ingresos (margenes altos como proxy)
  const top5Productos = data.topProductos.slice(0, 5).map((p) => ({
    name: p.nombre,
    value: p.ingresos,
    label: `S/ ${p.ingresos >= 1000 ? `${(p.ingresos / 1000).toFixed(1)}k` : p.ingresos.toFixed(0)}`,
    sublabel: `${p.unidades} uds`,
  }));

  // Cobertura categorias = (claseA + claseB) / total
  const totalClasificados = data.claseA + data.claseB + data.claseC;
  const coberturaPct = totalClasificados > 0
    ? ((data.claseA + data.claseB) / totalClasificados) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Row 2: FULL-WIDTH — Top 20 productos ── */}
      <ChartCard
        title="Performance de productos — top 10 por ingresos"
        Icon={TrendingUp}
        height={380}
        subtitle="Ingreso, utilidad y unidades vendidas"
        isEmpty={data.topProductos.length === 0}
        emptyText="Sin ventas en el periodo"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.topProductos.slice(0, 10)} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.grid} />
            <XAxis type="number" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <YAxis type="category" dataKey="nombre" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} width={130} />
            <Tooltip content={<ChartTooltip prefix="S/" />} />
            <Bar dataKey="ingresos" name="Ingresos" radius={[0, 6, 6, 0]} barSize={22}>
              {data.topProductos.slice(0, 10).map((_, i) => (
                <Cell key={i} fill={i < 3 ? T.brand : T.blue} opacity={i < 3 ? 1 : 0.6} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Analisis Pareto ABC (80/20)"
          Icon={Target}
          height={280}
          subtitle="Concentracion de ingresos por producto"
          badge={
            <div className="flex items-center gap-2 text-[length:var(--ts-2xs)]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: T.brand }} />A</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: T.blue }} />B</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />C</span>
            </div>
          }
          isEmpty={data.paretoData.length === 0}
          emptyText="Sin datos suficientes"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.paretoData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 8, fill: T.tickFill }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={50} interval={0} />
              <YAxis yAxisId="left" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar yAxisId="left" dataKey="ingresos" name="Ingresos" radius={[4, 4, 0, 0]}>
                {data.paretoData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="acumulado" name="% Acum" stroke={T.amber} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Productos sin movimiento"
          Icon={Package}
          height={280}
          subtitle="Sin ventas en el periodo"
          isEmpty={data.productosSinMov.length === 0}
          emptyText="Todos rotaron"
          EmptyIcon={Package}
        >
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {data.productosSinMov.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-foreground truncate leading-tight">{p.nombre}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight">{p.categoria}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{p.stock} uds</span>
                  <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] tabular-nums">S/ {p.precio.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Distribucion por categoria"
          Icon={ShoppingBasket}
          height={220}
          isEmpty={categoriasData.length === 0}
          emptyText="Sin ventas"
        >
          <MicroDonut
            data={categoriasData}
            centerLabel={String(data.productosActivos)}
            centerSubLabel="productos"
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 productos por ingresos"
          Icon={Layers}
          height={220}
          isEmpty={top5Productos.length === 0}
          emptyText="Sin ventas"
        >
          <MicroList items={top5Productos} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Cobertura de catalogo"
          Icon={Target}
          height={220}
          subtitle={`${data.claseA} A · ${data.claseB} B · ${data.claseC} C`}
        >
          <MicroGauge
            value={coberturaPct}
            max={100}
            centerLabel={`${coberturaPct.toFixed(0)}%`}
            centerSubLabel="A+B del top"
            footerText={
              coberturaPct >= 60
                ? "Buena concentracion"
                : coberturaPct >= 40
                  ? "Concentracion media"
                  : "Catalogo disperso"
            }
          />
        </ChartCard>
      </div>

      {/* ── Row opcional: Afinidades ── */}
      {data.afinidades.length > 0 && (
        <ChartCard
          title="Afinidades de compra"
          Icon={Link2}
          height={220}
          subtitle="Productos comprados juntos con frecuencia"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 max-h-[200px] overflow-y-auto">
            {data.afinidades.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0",
                  i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                )}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    <span className="font-medium">{a.productoA}</span>
                    <span className="text-[var(--text-tertiary)] mx-1">+</span>
                    <span className="font-medium">{a.productoB}</span>
                  </p>
                </div>
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded shrink-0">
                  {a.coCompras}x juntos
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
