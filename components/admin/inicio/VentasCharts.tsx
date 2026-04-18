"use client";

/**
 * VentasCharts — pattern unificado de 4 filas:
 *  - Row 2 (main): "Ventas y Utilidad 14d" en FILA COMPLETA (height 340)
 *  - Row 3 (secondary): "Por categoria" + "Por hora del dia" (lg:grid-cols-2)
 *  - Row 4 (micro): MicroDonut metodo pago + MicroList top productos + MicroGauge meta mes
 *  - Row 5 (forecast): pronostico 7d (solo si hay data)
 */

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Clock,
  CreditCard,
  Target,
  ShoppingCart,
  CalendarDays,
  Layers,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { VentasData } from "./VentasDashboard";
import {
  ChartCard,
  ChartTooltip,
  CHART_TOKENS,
  MicroDonut,
  MicroList,
  MicroGauge,
} from "./_shared";

const T = CHART_TOKENS;

export default function VentasCharts({ data }: { data: VentasData }) {
  // Meta del mes — heuristica: meta = 1.2x mes anterior (o usar slope si esta available)
  const metaMes = data.ventasNetas > 0 ? Math.max(data.ventasNetas * 1.2, data.ventasNetas + 500) : 1000;
  const pctMeta = metaMes > 0 ? (data.ventasNetas / metaMes) * 100 : 0;

  // Top 5 productos — usamos sparkVentas como fallback ya que VentasData no expone top5 directo
  // Construimos lista a partir de payment methods top como proxy de "donde se concentra el dinero"
  const top5 = data.metodosPago.slice(0, 5).map((p) => ({
    name: p.metodo,
    value: p.total,
    label: `S/ ${p.total.toFixed(0)}`,
    color: p.color,
  }));

  return (
    <div className="space-y-4">
      {/* ── Row 2: GRAFICO PRINCIPAL FULL-WIDTH ── */}
      <ChartCard
        title="Ventas y Utilidad — ultimos 14 dias"
        Icon={TrendingUp}
        height={340}
        subtitle="Ingreso bruto vs margen, con promedio movil 7d"
        badge={
          data.wowGrowth != null ? (
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-md whitespace-nowrap",
                data.wowGrowth >= 0
                  ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
                  : "bg-[var(--data-error-50)] text-[var(--data-error)] dark:bg-red-950/30 dark:text-[var(--data-error)]",
              )}
            >
              {data.wowGrowth >= 0 ? "↑" : "↓"} {Math.abs(data.wowGrowth).toFixed(1)}% sem/sem
            </span>
          ) : undefined
        }
        isEmpty={data.ventasDiarias.length === 0}
        emptyText="Sin ventas en el periodo"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.ventasDiarias} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradVentasMain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.blue} stopOpacity={0.25} />
                <stop offset="95%" stopColor={T.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradUtilMain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.emerald} stopOpacity={0.18} />
                <stop offset="95%" stopColor={T.emerald} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: T.axisFontSize, fill: T.tickFill }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: T.axisFontSize, fill: T.tickFill }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip content={<ChartTooltip prefix="S/" />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="ventas"
              name="Ventas"
              stroke={T.blue}
              fill="url(#gradVentasMain)"
              strokeWidth={2.5}
              dot={false}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="utilidad"
              name="Utilidad"
              stroke={T.emerald}
              fill="url(#gradUtilMain)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="promedio7d"
              name="Prom 7d"
              stroke={T.amber}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 CHARTS SECUNDARIOS ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Ventas por dia de semana"
          Icon={CalendarDays}
          height={260}
          subtitle="Total acumulado por dia (Lun-Dom)"
          isEmpty={!data.ventasPorDia.some((d) => d.total > 0)}
          emptyText="Sin datos en el periodo"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.ventasPorDia} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.grid} />
              <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="total" name="Ventas" radius={[6, 6, 0, 0]}>
                {data.ventasPorDia.map((entry, i) => {
                  const max = Math.max(...data.ventasPorDia.map((d) => d.total));
                  const isMax = entry.total === max && entry.total > 0;
                  return (
                    <Cell
                      key={i}
                      fill={isMax ? T.brand : T.blue}
                      opacity={entry.total > 0 ? 1 : 0.15}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Ventas por hora del dia"
          Icon={Clock}
          height={260}
          subtitle="Distribucion horaria de hoy"
          isEmpty={!data.ventasPorHora.some((h) => h.ventas > 0)}
          emptyText="Sin ventas hoy"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.ventasPorHora} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradHora" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.violet} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={T.violet} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 9, fill: T.tickFill }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="ventas"
                name="Tickets"
                stroke={T.violet}
                fill="url(#gradHora)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 MICRO-INSIGHTS ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Metodo de pago"
          Icon={CreditCard}
          height={210}
          isEmpty={data.metodosPago.length === 0}
          emptyText="Sin pagos en el periodo"
        >
          <MicroDonut
            data={data.metodosPago.map((p) => ({
              name: p.metodo,
              value: p.total,
              color: p.color,
            }))}
            centerLabel={`${data.metodosPago[0]?.porcentaje.toFixed(0) ?? 0}%`}
            centerSubLabel={data.metodosPago[0]?.metodo ?? ""}
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 metodos por monto"
          Icon={Layers}
          height={210}
          isEmpty={top5.length === 0}
          emptyText="Sin ventas"
        >
          <MicroList items={top5} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Meta del periodo"
          Icon={Target}
          height={210}
          subtitle={`S/ ${data.ventasNetas.toFixed(0)} de S/ ${metaMes.toFixed(0)}`}
        >
          <MicroGauge
            value={pctMeta}
            max={100}
            centerLabel={`${pctMeta.toFixed(0)}%`}
            centerSubLabel="del objetivo"
            footerText={
              pctMeta >= 100
                ? "Meta superada"
                : `Faltan S/ ${(metaMes - data.ventasNetas).toFixed(0)}`
            }
          />
        </ChartCard>
      </div>

      {/* ── Row 5 opcional: Forecast 7d ── */}
      {data.forecast7.length > 0 && data.forecast7.some((f) => f.estimado > 0) && (
        <ChartCard title="Pronostico 7 dias" Icon={TrendingUp} height={200} subtitle="Estimacion lineal segun tendencia">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.forecast7} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="estimado" name="Estimado" fill={T.cyan} radius={[6, 6, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
