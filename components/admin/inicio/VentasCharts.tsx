"use client";

import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  ComposedChart, Line,
} from "recharts";
import { BarChart3, CreditCard, Target, Clock, TrendingUp, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VentasData } from "./VentasDashboard";

// ── Colors ───────────────────────────────────────────────────────────────────
const BLUE = "#3b82f6";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const VIOLET = "#8b5cf6";
const ORANGE = "#f97316";
const RED = "#ef4444";
const CYAN = "#06b6d4";

// ── Shared tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, prefix = "S/" }: {
  active?: boolean; payload?: { name?: string; value: number; color?: string; fill?: string }[]; label?: string; prefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 dark:text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill || BLUE }} />
          <span className="text-gray-500 dark:text-muted">{p.name}:</span>
          <span className="font-bold text-gray-900 dark:text-foreground">
            {prefix === "S/" ? `S/ ${p.value.toFixed(2)}` : `${p.value}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, Icon, children, className, badge }: {
  title: string; Icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={cn("bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl p-5 ", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-400 dark:text-muted" />
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground">{title}</h3>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text = "Sin datos" }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
      <BarChart3 className="h-8 w-8 mb-2" />
      <p className="text-xs font-medium">{text}</p>
    </div>
  );
}

// ── Main Charts ──────────────────────────────────────────────────────────────

export default function VentasCharts({ data }: { data: VentasData }) {
  return (
    <div className="space-y-5">
      {/* ── Row 1: Revenue trend + Payment methods ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard
          title="Ventas y Utilidad"
          Icon={TrendingUp}
          className="lg:col-span-3"
          badge={data.wowGrowth != null ? (
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md",
              data.wowGrowth >= 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
            )}>
              {data.wowGrowth >= 0 ? "↑" : "↓"} {Math.abs(data.wowGrowth).toFixed(1)}% sem/sem
            </span>
          ) : undefined}
        >
          {data.ventasDiarias.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data.ventasDiarias}>
                <defs>
                  <linearGradient id="gradVentasV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BLUE} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="ventas" name="Ventas" stroke={BLUE} fill="url(#gradVentasV)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke={EMERALD} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="promedio7d" name="Prom. 7d" stroke={AMBER} strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Métodos de pago" Icon={CreditCard} className="lg:col-span-2">
          {data.metodosPago.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.metodosPago} dataKey="total" nameKey="metodo" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                    {data.metodosPago.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {data.metodosPago.map((p, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-gray-500 dark:text-muted">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    {p.metodo} <span className="font-bold">{p.porcentaje.toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            </div>
          ) : <EmptyState text="Sin ventas este mes" />}
        </ChartCard>
      </div>

      {/* ── Row 2: Horas pico + Ventas por día semana + Funnel ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Horas pico" Icon={Clock}>
          {data.ventasPorHora.some(h => h.ventas > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.ventasPorHora} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hora" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip prefix="" />} />
                <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                  {data.ventasPorHora.map((entry, i) => {
                    const max = Math.max(...data.ventasPorHora.map(h => h.ventas));
                    return <Cell key={i} fill={entry.ventas === max && entry.ventas > 0 ? ORANGE : VIOLET} opacity={entry.ventas > 0 ? 1 : 0.15} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Sin ventas hoy aún" />}
        </ChartCard>

        <ChartCard title="Ventas por día de semana" Icon={CalendarDays}>
          {data.ventasPorDia.some(d => d.total > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.ventasPorDia} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Total" radius={[6, 6, 0, 0]}>
                  {data.ventasPorDia.map((entry, i) => {
                    const max = Math.max(...data.ventasPorDia.map(d => d.total));
                    return <Cell key={i} fill={entry.total === max && entry.total > 0 ? EMERALD : CYAN} opacity={entry.total > 0 ? 1 : 0.2} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Sin datos este mes" />}
        </ChartCard>

        <ChartCard title="Embudo de pedidos" Icon={Target}>
          {data.funnelPedidos[0]?.cantidad > 0 ? (
            <div className="space-y-3 pt-2">
              {data.funnelPedidos.map((step, i) => {
                const maxCount = data.funnelPedidos[0].cantidad || 1;
                const pct = (step.cantidad / maxCount) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[length:var(--ts-xs)] font-medium text-gray-600 dark:text-gray-300">{step.etapa}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[length:var(--ts-2xs)] text-gray-400">{pct.toFixed(0)}%</span>
                        <span className="text-[length:var(--ts-xs)] font-bold text-gray-900 dark:text-foreground">{step.cantidad}</span>
                      </div>
                    </div>
                    <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-[var(--dur-slower)]" style={{ width: `${pct}%`, backgroundColor: step.color }} />
                    </div>
                  </div>
                );
              })}
              {data.funnelPedidos.length >= 4 && data.funnelPedidos[0].cantidad > 0 && (
                <p className="text-[length:var(--ts-2xs)] text-gray-400 text-center mt-2">
                  Conversión total: <span className="font-bold text-gray-600 dark:text-gray-300">{((data.funnelPedidos[3]?.cantidad ?? 0) / data.funnelPedidos[0].cantidad * 100).toFixed(0)}%</span> entregados
                </p>
              )}
            </div>
          ) : <EmptyState text="Sin pedidos este mes" />}
        </ChartCard>
      </div>

      {/* ── Row 3: Forecast ── */}
      {data.forecast7.length > 0 && data.forecast7.some(f => f.estimado > 0) && (
        <ChartCard title="Pronóstico 7 días" Icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.forecast7} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="estimado" name="Estimado" fill={BLUE} radius={[6, 6, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
