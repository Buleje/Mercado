"use client";

/**
 * InicioCharts (hub) — pattern unificado:
 *  - Row 2 (FULL): Ventas y Utilidad — ComposedChart 14d
 *  - Row 3: Top productos + Flujo de efectivo
 *  - Row 4: MicroDonut metodo pago + MicroList top productos + MicroGauge meta
 *  - Row 5: Stock alerts + Clientes por tier + Embudo pedidos (compactos)
 */

import {
  Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import {
  TrendingUp, Package, ShoppingCart, CreditCard, Target,
  AlertTriangle, Truck, Layers, BarChart3,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./InicioDashboard";
import {
  ChartCard, ChartTooltip, CHART_TOKENS,
  MicroDonut, MicroList, MicroGauge,
} from "./_shared";

const T = CHART_TOKENS;

export default function InicioCharts({ data }: { data: DashboardData }) {
  // Top 5 productos para MicroList
  const top5 = data.topProductos.slice(0, 5).map((p) => ({
    name: p.nombre,
    value: p.ingresos,
    label: `S/ ${p.ingresos >= 1000 ? `${(p.ingresos / 1000).toFixed(1)}k` : Number(p.ingresos).toFixed(0)}`,
    sublabel: `${p.unidades} uds`,
  }));

  // Meta del periodo — heuristica
  const metaPeriodo = Math.max(data.ventasHoy * 1.2, data.ventasHoy + 500);
  const pctMeta = metaPeriodo > 0 ? (data.ventasHoy / metaPeriodo) * 100 : 0;

  // Metodo de pago para donut
  const metodoData = data.ventasPorMetodoPago.map((m) => ({
    name: m.metodo, value: m.total, color: m.color,
  }));

  return (
    <div className="space-y-4">
      {/* ── Row 2: FULL-WIDTH — Ventas y Utilidad ── */}
      <ChartCard
        title="Ventas y Utilidad — ultimos 14 dias"
        Icon={TrendingUp}
        height={340}
        subtitle="Ingreso bruto vs margen"
        isEmpty={data.ventasDiarias.length === 0}
        emptyText="Sin ventas en el periodo"
      >
        <ResponsiveContainer minWidth={0} width="100%" height="100%">
          <ComposedChart data={data.ventasDiarias} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradVentasInicio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.blue} stopOpacity={0.25} />
                <stop offset="95%" stopColor={T.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradUtilInicio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.emerald} stopOpacity={0.18} />
                <stop offset="95%" stopColor={T.emerald} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<ChartTooltip prefix="S/" />} />
            <Area type="monotone" dataKey="ventas" name="Ventas" stroke={T.blue} fill="url(#gradVentasInicio)" strokeWidth={2.5} dot={false} />
            <Area type="monotone" dataKey="utilidad" name="Utilidad" stroke={T.emerald} fill="url(#gradUtilInicio)" strokeWidth={2} dot={false} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top productos del periodo"
          Icon={BarChart3}
          height={280}
          subtitle="Por ingresos generados"
          isEmpty={data.topProductos.length === 0}
          emptyText="Sin ventas"
        >
          <ResponsiveContainer minWidth={0} width="100%" height="100%">
            <BarChart data={data.topProductos.slice(0, 8)} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.grid} />
              <XAxis type="number" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="ingresos" name="Ingresos" radius={[0, 6, 6, 0]} barSize={20}>
                {data.topProductos.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={i < 3 ? T.brand : T.blue} opacity={i < 3 ? 1 : 0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Flujo de efectivo"
          Icon={TrendingUp}
          height={280}
          subtitle="Ingresos vs egresos por dia"
          isEmpty={data.flujoEfectivo.length === 0}
          emptyText="Sin movimientos"
        >
          <ResponsiveContainer minWidth={0} width="100%" height="100%">
            <BarChart data={data.flujoEfectivo} barGap={-2} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 9, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="ingresos" name="Ingresos" fill={T.emerald} radius={[4, 4, 0, 0]} barSize={12} />
              <Bar dataKey="egresos" name="Egresos" fill={T.red} radius={[4, 4, 0, 0]} barSize={12} opacity={0.7} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Metodo de pago"
          Icon={CreditCard}
          height={220}
          isEmpty={metodoData.length === 0}
          emptyText="Sin pagos"
        >
          <MicroDonut
            data={metodoData}
            centerLabel={data.ventasPorMetodoPago[0]?.metodo ?? ""}
            centerSubLabel={data.ventasPorMetodoPago.length > 0 ? "principal" : ""}
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 productos"
          Icon={Layers}
          height={220}
          isEmpty={top5.length === 0}
          emptyText="Sin ventas"
        >
          <MicroList items={top5} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Meta del periodo"
          Icon={Target}
          height={220}
          subtitle={`S/ ${Number(data.ventasHoy).toFixed(0)} / S/ ${metaPeriodo.toFixed(0)}`}
        >
          <MicroGauge
            value={pctMeta}
            max={100}
            centerLabel={`${pctMeta.toFixed(0)}%`}
            centerSubLabel="del objetivo"
            footerText={
              pctMeta >= 100
                ? "Meta superada"
                : `Faltan S/ ${(metaPeriodo - data.ventasHoy).toFixed(0)}`
            }
          />
        </ChartCard>
      </div>

      {/* ── Row 5: 3 alertas + funnel ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Stock próximo a agotar"
          Icon={AlertTriangle}
          height={250}
          subtitle="Top 8 productos criticos"
          isEmpty={data.stockAlerta.length === 0}
          emptyText="Stock saludable"
          EmptyIcon={Package}
        >
          <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
            {data.stockAlerta.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate leading-tight">{p.nombre}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          p.diasRestantes < 7 ? "bg-[var(--data-error-500)]" : p.diasRestantes < 14 ? "bg-[var(--data-warning-500)]" : "bg-primary/10",
                        )}
                        style={{ width: `${Math.min((p.stock / Math.max(p.mínimo * 3, 1)) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-[length:var(--ts-2xs)] font-bold whitespace-nowrap",
                      p.diasRestantes < 7 ? "text-[var(--data-error-500)]" : p.diasRestantes < 14 ? "text-[var(--data-warning-500)]" : "text-[var(--data-success-500)]",
                    )}>{p.diasRestantes}d</span>
                  </div>
                </div>
                <span className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] whitespace-nowrap">{p.stock} uds</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Embudo de pedidos"
          Icon={ShoppingCart}
          height={250}
          subtitle="Conversion del periodo"
          isEmpty={!data.funnelPedidos[0] || data.funnelPedidos[0].cantidad === 0}
          emptyText="Sin pedidos"
        >
          <div className="space-y-3">
            {data.funnelPedidos.map((step, i) => {
              const maxCount = data.funnelPedidos[0]?.cantidad || 1;
              const pct = (step.cantidad / maxCount) * 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)]">{step.etapa}</span>
                    <span className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] tabular-nums">{step.cantidad}</span>
                  </div>
                  <div className="h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-[var(--dur-slower)]"
                      style={{ width: `${pct}%`, backgroundColor: step.color }}
                    />
                  </div>
                </div>
              );
            })}
            {data.funnelPedidos[0]?.cantidad > 0 && (
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center mt-2">
                Conversion: <span className="font-bold text-[var(--text-secondary)]">{((data.funnelPedidos[3]?.cantidad ?? 0) / data.funnelPedidos[0].cantidad * 100).toFixed(0)}%</span>
              </p>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Compras por proveedor"
          Icon={Truck}
          height={250}
          subtitle="Top proveedores del periodo"
          isEmpty={data.comprasPorProveedor.length === 0}
          emptyText="Sin compras"
        >
          <ResponsiveContainer minWidth={0} width="100%" height="100%">
            <BarChart data={data.comprasPorProveedor.slice(0, 6)} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.grid} />
              <XAxis type="number" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <YAxis type="category" dataKey="proveedor" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="total" name="Total" fill={T.cyan} radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
