"use client";

/**
 * InventarioCharts — pattern unificado:
 *  - Row 2 (FULL): Movimiento de inventario 14d — AreaChart entradas/salidas
 *  - Row 3: Top 10 productos por valor + Stock por categoria
 *  - Row 4: ABC analysis donut + Top 5 proximos a vencer + Tasa rotacion gauge
 */

import {
  AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import {
  Package, AlertTriangle, Layers, ShoppingCart, TrendingUp, Target, Timer,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { InventarioData } from "./InventarioDashboard";
import {
  ChartCard, ChartTooltip, CHART_TOKENS,
  MicroDonut, MicroList, MicroGauge,
} from "./_shared";

const T = CHART_TOKENS;

export default function InventarioCharts({ data }: { data: InventarioData }) {
  // ABC analysis basado en stockPorCategoria — cantidad de items en cada rango
  const abcData = data.distribucionStock.map((d) => ({
    name: d.rango, value: d.cantidad, color: d.color,
  })).filter((d) => d.value > 0);

  // Top 5 proximos a agotar (ya esta sorted por diasRestantes asc)
  const top5Vencer = data.proyeccionAgotamiento.slice(0, 5).map((p) => ({
    name: p.nombre,
    value: 30 - Math.min(p.diasRestantes, 30), // mas dias menos = mas alto
    label: `${p.diasRestantes}d`,
    sublabel: `${p.stock} uds`,
    color: p.status === "critico" ? T.red : p.status === "alerta" ? T.amber : T.emerald,
  }));

  // Rotacion gauge — segun rotacionGeneral, 2x mensual = 100% optimo
  const rotacionPct = Math.min((data.rotacionGeneral / 2) * 100, 100);

  return (
    <div className="space-y-4">
      {/* ── Row 2: FULL-WIDTH — Movimiento ── */}
      <ChartCard
        title="Movimiento de inventario — ultimos 14 dias"
        Icon={ShoppingCart}
        height={340}
        subtitle="Entradas vs salidas diarias"
        isEmpty={data.movimientoDiario.length === 0}
        emptyText="Sin movimientos en el periodo"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.movimientoDiario} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradEntradas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.emerald} stopOpacity={0.3} />
                <stop offset="95%" stopColor={T.emerald} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradSalidas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.red} stopOpacity={0.25} />
                <stop offset="95%" stopColor={T.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="entradas" name="Entradas" stroke={T.emerald} fill="url(#gradEntradas)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="salidas" name="Salidas" stroke={T.red} fill="url(#gradSalidas)" strokeWidth={2.5} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Stock por categoria"
          Icon={Layers}
          height={280}
          subtitle="Valor en S/ por categoria"
          isEmpty={data.stockPorCategoria.length === 0}
          emptyText="Sin productos categorizados"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.stockPorCategoria} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.grid} />
              <XAxis type="number" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} width={120} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="valor" name="Valor" radius={[0, 6, 6, 0]} barSize={20}>
                {data.stockPorCategoria.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Productos para reponer"
          Icon={AlertTriangle}
          height={280}
          subtitle="Stock <= minimo"
          isEmpty={data.productosCriticos.length === 0}
          emptyText="Sin productos criticos"
        >
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {data.productosCriticos.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-foreground truncate leading-tight">{p.nombre}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted leading-tight">{p.categoria}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-bold text-[var(--data-error)]">{p.stock}/{p.stockMin}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Pedir {p.reorder} uds</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Distribucion de stock"
          Icon={Layers}
          height={220}
          isEmpty={abcData.length === 0}
          emptyText="Sin productos"
        >
          <MicroDonut
            data={abcData}
            centerLabel={String(data.totalProductos)}
            centerSubLabel="productos"
            tooltipFormatter={(v) => `${v} items`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 proximos a agotar"
          Icon={Timer}
          height={220}
          isEmpty={top5Vencer.length === 0}
          emptyText="Stock saludable"
          EmptyIcon={Package}
        >
          <MicroList items={top5Vencer} barColor={T.amber} showRank />
        </ChartCard>

        <ChartCard
          title="Tasa de rotacion"
          Icon={Target}
          height={220}
          subtitle={`${data.rotacionGeneral.toFixed(2)}x periodo`}
        >
          <MicroGauge
            value={rotacionPct}
            max={100}
            centerLabel={`${data.rotacionGeneral.toFixed(1)}x`}
            centerSubLabel="rotacion"
            footerText={
              data.rotacionGeneral >= 2
                ? "Rotacion alta — saludable"
                : data.rotacionGeneral >= 1
                  ? "Rotacion media"
                  : "Rotacion baja — revisar surtido"
            }
          />
        </ChartCard>
      </div>

      {/* ── Row opcional: Top salidas ── */}
      {data.topSalidas.length > 0 && (
        <ChartCard
          title="Top salidas del periodo"
          Icon={TrendingUp}
          height={220}
          subtitle="Productos mas vendidos por unidades"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 max-h-[200px] overflow-y-auto">
            {data.topSalidas.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0",
                    i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                  )}>{i + 1}</span>
                  <p className="text-xs font-medium text-[var(--text-secondary)] truncate">{p.nombre}</p>
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground shrink-0 tabular-nums">{p.unidades} uds</span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
