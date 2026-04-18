"use client";

/**
 * ComprasCharts — pattern unificado:
 *  - Row 2 (FULL): Historico compras 6 meses + dailie 14d (BarChart)
 *  - Row 3: Top proveedores + Cuentas proximas a vencer
 *  - Row 4: MicroDonut estado ordenes + MicroList por proveedor + MicroGauge dias pago
 */

import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  Truck, Clock, CreditCard, DollarSign, BarChart3, Target,
  CalendarDays,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ComprasData } from "./ComprasDashboard";
import {
  ChartCard, ChartTooltip, CHART_TOKENS,
  MicroDonut, MicroList, MicroGauge,
} from "./_shared";

const T = CHART_TOKENS;

export default function ComprasCharts({ data }: { data: ComprasData }) {
  // Estado ordenes para donut
  const estadoData = data.estadoCuentas.map((e) => ({
    name: e.estado, value: e.monto, color: e.color,
  }));

  // Top 5 proveedores por monto
  const top5Proveedores = data.topProveedores.slice(0, 5).map((p) => ({
    name: p.nombre,
    value: p.total,
    label: `S/ ${p.total >= 1000 ? `${(p.total / 1000).toFixed(1)}k` : p.total.toFixed(0)}`,
    sublabel: `${p.ordenes} ordenes`,
  }));

  // Dias promedio de pago — heuristica: si hay vencidos, mas alto es peor
  const totalPayables = data.cuentasPorVencer.length || 1;
  const avgDays = data.cuentasPorVencer.length > 0
    ? data.cuentasPorVencer.reduce((a, c) => a + Math.max(c.diasRestantes, 0), 0) / totalPayables
    : 30;
  // Gauge: 30 dias = 100% (saludable). Mas dias = mejor
  const diasPagoPct = Math.min((avgDays / 30) * 100, 100);

  return (
    <div className="space-y-4">
      {/* ── Row 2: FULL-WIDTH — Compras historico ── */}
      <ChartCard
        title="Compras mensuales — ultimos 6 meses"
        Icon={DollarSign}
        height={340}
        subtitle="Total gastado en compras a proveedores"
        isEmpty={!data.comprasMensuales.some((c) => c.total > 0)}
        emptyText="Sin compras historicas"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.comprasMensuales} barCategoryGap="22%" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<ChartTooltip prefix="S/" />} />
            <Bar dataKey="total" name="Compras" fill={T.brand} radius={[6, 6, 0, 0]}>
              {data.comprasMensuales.map((entry, i) => {
                const max = Math.max(...data.comprasMensuales.map((c) => c.total));
                const isMax = entry.total === max && entry.total > 0;
                return (
                  <Cell key={i} fill={isMax ? T.brand : T.blue} opacity={entry.total > 0 ? 1 : 0.15} />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Row 3: 2 secondary charts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Compras del periodo (diario)"
          Icon={CalendarDays}
          height={280}
          subtitle="Tendencia diaria de compras"
          isEmpty={data.comprasDiarias.length === 0}
          emptyText="Sin compras en el periodo"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.comprasDiarias} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradComp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.brand} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={T.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v}`} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Area type="monotone" dataKey="total" name="Compras" stroke={T.brand} fill="url(#gradComp)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Cuentas por vencer"
          Icon={Clock}
          height={280}
          subtitle="Pagos pendientes ordenados por fecha"
          isEmpty={data.cuentasPorVencer.length === 0}
          emptyText="Sin cuentas pendientes"
        >
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {data.cuentasPorVencer.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-foreground truncate leading-tight">{c.nombre}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground tabular-nums">S/ {c.monto.toFixed(0)}</span>
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded whitespace-nowrap",
                    c.status === "vencido"
                      ? "bg-[var(--data-error-50)] text-[var(--data-error)] dark:bg-red-950/30"
                      : c.status === "urgente"
                        ? "bg-[var(--data-warning-50)] text-[var(--data-warning)] dark:bg-amber-950/30"
                        : "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)]",
                  )}>
                    {c.diasRestantes < 0 ? `${Math.abs(c.diasRestantes)}d atras` : `${c.diasRestantes}d`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* ── Row 4: 3 micro-insights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Estado de cuentas"
          Icon={CreditCard}
          height={220}
          isEmpty={estadoData.length === 0}
          emptyText="Sin cuentas"
        >
          <MicroDonut
            data={estadoData}
            centerLabel={`S/ ${data.deudaPendiente >= 1000 ? `${(data.deudaPendiente / 1000).toFixed(1)}k` : data.deudaPendiente.toFixed(0)}`}
            centerSubLabel="Pendiente"
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 proveedores"
          Icon={Truck}
          height={220}
          isEmpty={top5Proveedores.length === 0}
          emptyText="Sin historial"
        >
          <MicroList items={top5Proveedores} barColor={T.brand} showRank />
        </ChartCard>

        <ChartCard
          title="Dias de pago promedio"
          Icon={Target}
          height={220}
          subtitle={`${data.cuentasVencidas} vencidas`}
        >
          <MicroGauge
            value={diasPagoPct}
            max={100}
            centerLabel={`${avgDays.toFixed(0)}d`}
            centerSubLabel="hasta vencer"
            footerText={
              data.cuentasVencidas > 0
                ? `${data.cuentasVencidas} cuenta${data.cuentasVencidas > 1 ? "s" : ""} vencida${data.cuentasVencidas > 1 ? "s" : ""}`
                : avgDays >= 15
                  ? "Pagos saludables"
                  : "Pagos urgentes"
            }
            color={data.cuentasVencidas > 0 ? T.red : avgDays >= 15 ? T.emerald : T.amber}
          />
        </ChartCard>
      </div>

      {/* ── Row opcional: Compras por proveedor (donut grande) ── */}
      {data.comprasPorProveedor.length > 0 && (
        <ChartCard
          title="Compras del periodo por proveedor"
          Icon={BarChart3}
          height={260}
          subtitle="Distribucion del gasto entre proveedores"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.comprasPorProveedor.slice(0, 10)} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.grid} />
              <XAxis type="number" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: T.axisFontSize, fill: T.tickFill }} axisLine={false} tickLine={false} width={120} />
              <Tooltip content={<ChartTooltip prefix="S/" />} />
              <Bar dataKey="total" name="Total" radius={[0, 6, 6, 0]} barSize={20}>
                {data.comprasPorProveedor.slice(0, 10).map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

    </div>
  );
}
