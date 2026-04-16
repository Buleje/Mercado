"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, AreaChart, Area,
  ComposedChart, Line, Legend,
} from "recharts";
import type { CajaData } from "./CajaDashboard";

const GRID = "stroke-gray-200 dark:stroke-gray-700 opacity-40";
const AXIS_TICK = { fill: "#9ca3af", fontSize: 11 };

/* eslint-disable @typescript-eslint/no-explicit-any */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-gray-300">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? "#fff" }} className="font-bold">
          {p.name}: S/ {Number(p.value).toFixed(2)}
        </p>
      ))}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function CajaCharts({ data }: { data: CajaData }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ── Daily cash flow ── */}
      <ChartCard title="Flujo Diario" subtitle="Ingresos vs Egresos" span="lg:col-span-2">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data.flujoDiario}>
            <CartesianGrid strokeDasharray="3 3" className={GRID} />
            <XAxis dataKey="dia" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} tickFormatter={v => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
            <Bar dataKey="egresos" name="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={24} />
            <Line dataKey="balance" name="Balance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Payment methods ── */}
      <ChartCard title="Métodos de Pago" subtitle="Distribución de ingresos">
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={200}>
            <PieChart>
              <Pie data={data.metodosPago} dataKey="monto" nameKey="metodo" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={3}>
                {data.metodosPago.map((m, i) => <Cell key={i} fill={m.color} stroke="transparent" />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {data.metodosPago.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: m.color }} />
                <span className="text-gray-600 dark:text-muted flex-1 truncate">{m.metodo}</span>
                <span className="font-bold text-gray-900 dark:text-foreground">{m.porcentaje.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      {/* ── Waterfall analysis ── */}
      <ChartCard title="Descomposición de Flujo" subtitle="De ventas a utilidad neta">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.waterfall} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className={GRID} horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickFormatter={v => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <YAxis type="category" dataKey="concepto" tick={AXIS_TICK} width={110} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={20}>
              {data.waterfall.map((w, i) => <Cell key={i} fill={w.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── 7-day forecast ── */}
      <ChartCard title="Pronóstico 7 Días" subtitle="Basado en promedio reciente">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.forecast7}>
            <CartesianGrid strokeDasharray="3 3" className={GRID} />
            <XAxis dataKey="dia" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} tickFormatter={v => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="ingreso" name="Ingreso" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
            <Area type="monotone" dataKey="egreso" name="Egreso" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Monthly trend ── */}
      <ChartCard title="Tendencia Mensual">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.flujoMensual}>
            <CartesianGrid strokeDasharray="3 3" className={GRID} />
            <XAxis dataKey="mes" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} tickFormatter={v => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="egresos" name="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Income by hour ── */}
      <ChartCard title="Ingresos por Hora" subtitle="Distribución horaria">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.ingresosPorHora}>
            <CartesianGrid strokeDasharray="3 3" className={GRID} />
            <XAxis dataKey="hora" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} tickFormatter={v => `S/${v}`} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="monto" name="Ingreso" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children, span }: { title: string; subtitle?: string; children: React.ReactNode; span?: string }) {
  return (
    <div className={`bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl p-5 ${span ?? ""}`}>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-400 dark:text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
