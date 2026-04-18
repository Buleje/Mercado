"use client";

/**
 * CajaCharts — pattern unificado:
 *  - Row 2 (FULL): Flujo de caja 14d — AreaChart in/out stacked
 *  - Row 3: Tendencia mensual + Apertura vs cierre (gastos por categoria)
 *  - Row 4: Distribucion efectivo/digital donut + Top 5 conceptos + Ratio liquido gauge
 */

import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import {
  Wallet, ArrowUpFromLine, ArrowDownToLine, CreditCard, Layers, Target,
  CalendarDays,
} from "@buleje/design-system/icons";
import type { CajaData } from "./CajaDashboard";
import {
  ChartCard, ChartTooltip, CHART_TOKENS,
  MicroDonut, MicroList, MicroGauge,
} from "./_shared";

const T = CHART_TOKENS;

export default function CajaCharts({ data }: { data: CajaData }) {
  // Distribucion efectivo vs digital
  const efectivoTotal = data.metodosPago
    .filter((m) => m.metodo === "Efectivo")
    .reduce((a, m) => a + m.monto, 0);
  const digitalTotal = data.metodosPago
    .filter((m) => m.metodo !== "Efectivo")
    .reduce((a, m) => a + m.monto, 0);
  const totalIngresos = efectivoTotal + digitalTotal;

  const efectivoVsDigital = [
    { name: "Efectivo", value: efectivoTotal, color: T.emerald },
    { name: "Digital", value: digitalTotal, color: T.violet },
  ].filter((d) => d.value > 0);

  // Top 5 conceptos del waterfall (positivos absolutos)
  const top5Conceptos = data.waterfall
    .map((w) => ({
      name: w.concepto,
      value: Math.abs(w.monto),
      label: `S/ ${Math.abs(w.monto).toFixed(0)}`,
      color: w.color,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Ratio liquido = balance / max(ingresos, 1) * 100, clamp 0-100
  const ratioLiquido = data.ingresos > 0
    ? Math.max(0, Math.min(100, (data.balance / data.ingresos) * 100))
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Row 2: FULL-WIDTH — Flujo diario ── */}
      <ChartCard
        title="Flujo de caja — ultimos 14 dias"
        Icon={Wallet}
        height={340}
        subtitle="Ingresos vs egresos con balance acumulado"
        isEmpty={data.flujoDiario.length === 0}
        emptyText="Sin movimientos en el periodo"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.flujoDiario} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradIng" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.emerald} stopOpacity={0.3} />
                <stop offset="95%" stopColor={T.emerald} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradEgr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.red} stopOpacity={0.25} />
                <stop offset="95%" stopColor={T.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<ChartTooltip prefix="S/" />} />
            <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke={T.emerald} fill="url(#gradIng)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="egresos" name="Egresos" stroke={T.red} fill="url(#gradEgr)" strokeWidth={2} />
            <Line type="monotone" dataKey="balance" name="Balance" stroke={T.blue} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Tendencia mensual"
          Icon={CalendarDays}
          height={260}
          subtitle="Ingresos y egresos por mes (ultimos 6)"
          isEmpty={!data.flujoMensual.some((m) => m.ingresos > 0 || m.egresos > 0)}
          emptyText="Sin datos historicos"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.flujoMensual} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ingresos" name="Ingresos" fill={T.emerald} radius={[6, 6, 0, 0]} />
              <Bar dataKey="egresos" name="Egresos" fill={T.red} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Ingresos por hora del dia"
          Icon={ArrowUpFromLine}
          height={260}
          subtitle="Distribucion horaria de ingresos hoy"
          isEmpty={!data.ingresosPorHora.some((h) => h.monto > 0)}
          emptyText="Sin ingresos hoy"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.ingresosPorHora} barCategoryGap="15%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 9, fill: T.tickFill }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="monto" name="Ingreso" radius={[4, 4, 0, 0]}>
                {data.ingresosPorHora.map((entry, i) => {
                  const max = Math.max(...data.ingresosPorHora.map((h) => h.monto));
                  return (
                    <Cell
                      key={i}
                      fill={entry.monto === max && entry.monto > 0 ? T.brand : T.violet}
                      opacity={entry.monto > 0 ? 1 : 0.15}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Efectivo vs Digital"
          Icon={CreditCard}
          height={220}
          isEmpty={efectivoVsDigital.length === 0}
          emptyText="Sin pagos en el periodo"
        >
          <MicroDonut
            data={efectivoVsDigital}
            centerLabel={totalIngresos > 0 ? `${Math.round((digitalTotal / totalIngresos) * 100)}%` : "0%"}
            centerSubLabel="Digital"
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 conceptos"
          Icon={Layers}
          height={220}
          isEmpty={top5Conceptos.length === 0}
          emptyText="Sin movimientos"
        >
          <MicroList items={top5Conceptos} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Ratio liquido"
          Icon={Target}
          height={220}
          subtitle={`Balance: S/ ${data.balance.toFixed(0)}`}
        >
          <MicroGauge
            value={ratioLiquido}
            max={100}
            centerLabel={`${ratioLiquido.toFixed(0)}%`}
            centerSubLabel="balance/ingresos"
            footerText={
              ratioLiquido >= 30
                ? "Salud financiera buena"
                : ratioLiquido >= 10
                  ? "Vigilar gastos"
                  : "Atencion: gastos altos"
            }
          />
        </ChartCard>
      </div>

      {/* ── Row opcional: Waterfall (descomposicion) ── */}
      {data.waterfall.length > 0 && (
        <ChartCard
          title="Descomposicion de flujo"
          Icon={ArrowDownToLine}
          height={220}
          subtitle="De ventas a balance neto"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.waterfall} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.grid} />
              <XAxis type="number" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <YAxis type="category" dataKey="concepto" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} width={130} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="monto" name="Monto" radius={[0, 6, 6, 0]} barSize={22}>
                {data.waterfall.map((w, i) => (
                  <Cell key={i} fill={w.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
