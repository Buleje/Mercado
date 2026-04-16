"use client";

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  ComposedChart, Area, Line, AreaChart,
} from "recharts";
import { BarChart3, Users, Star, Heart, UserPlus, ShoppingCart, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientesData } from "./ClientesDashboard";

const BRAND = "#00B4A6";
const BLUE = "#3b82f6";
const EMERALD = "#10b981";
const VIOLET = "#8b5cf6";

function ChartTooltip({ active, payload, label, prefix = "" }: {
  active?: boolean; payload?: { name?: string; value: number; color?: string; fill?: string }[]; label?: string; prefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 dark:text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill || BRAND }} />
          <span className="text-gray-500 dark:text-muted">{p.name}:</span>
          <span className="font-bold text-gray-900 dark:text-foreground">{prefix}{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, Icon, children, className }: {
  title: string; Icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-5 ", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-gray-400 dark:text-muted" />
        <h3 className="text-sm font-bold text-gray-700 dark:text-foreground">{title}</h3>
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

export default function ClientesCharts({ data }: { data: ClientesData }) {
  return (
    <div className="space-y-5">
      {/* Row 1: Actividad diaria + Top clientes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Clientes por día" Icon={Users} className="lg:col-span-3">
          {data.clientesPorDia.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data.clientesPorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="activos" name="Activos" fill={BRAND} fillOpacity={0.15} stroke={BRAND} strokeWidth={2} />
                <Bar dataKey="nuevos" name="Nuevos" fill={VIOLET} radius={[4, 4, 0, 0]} opacity={0.8} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Top clientes" Icon={Crown} className="lg:col-span-2">
          {data.topClientes.length > 0 ? (
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {data.topClientes.map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                    i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                  )}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{c.nombre}</p>
                    <p className="text-[10px] text-gray-400">{c.pedidos} compras</p>
                  </div>
                  <span className="text-xs font-bold text-gray-900 dark:text-foreground shrink-0">S/ {c.gasto.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Sin clientes en el período" />}
        </ChartCard>
      </div>

      {/* Row 2: Retención mensual + Frecuencia de compra */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Retención mensual (nuevos vs recurrentes)" Icon={Heart}>
          {data.retencion.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.retencion} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="recurrentes" name="Recurrentes" fill={BLUE} radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="nuevos" name="Nuevos" fill={EMERALD} radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Frecuencia de compra" Icon={ShoppingCart}>
          {data.frecuenciaCompra.some(f => f.cantidad > 0) ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={data.frecuenciaCompra} dataKey="cantidad" nameKey="frecuencia" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                    {data.frecuenciaCompra.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {data.frecuenciaCompra.map((f, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-muted">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                    {f.frecuencia} ({f.cantidad})
                  </span>
                ))}
              </div>
            </div>
          ) : <EmptyState text="Sin compras en el período" />}
        </ChartCard>
      </div>

      {/* Row 3: Cohort table + Rating distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Cohortes de retención" Icon={Users}>
          {data.cohortData.some(c => c.m0 > 0) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 dark:text-muted">
                    <th className="text-left py-2 font-medium">Cohorte</th>
                    <th className="text-center py-2 font-medium">M0</th>
                    <th className="text-center py-2 font-medium">M1</th>
                    <th className="text-center py-2 font-medium">M2</th>
                    <th className="text-center py-2 font-medium">M3</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohortData.map((row, i) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-gray-800">
                      <td className="py-2 font-medium text-gray-700 dark:text-gray-300">{row.cohorte}</td>
                      {[row.m0, row.m1, row.m2, row.m3].map((val, j) => (
                        <td key={j} className="text-center py-2">
                          <span className={cn(
                            "inline-block px-2 py-0.5 rounded-md font-bold",
                            val >= 50 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : val >= 20 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : val > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                              : "text-gray-300 dark:text-gray-600"
                          )}>
                            {val}%
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState text="Sin data suficiente para cohortes" />}
        </ChartCard>

        <ChartCard title="Distribución de ratings" Icon={Star}>
          {data.distribucionRating.some(r => r.cantidad > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.distribucionRating} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="rating" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}★`} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="cantidad" name="Reseñas" radius={[6, 6, 0, 0]}>
                  {data.distribucionRating.map((entry, i) => (
                    <Cell key={i} fill={entry.rating >= 4 ? EMERALD : entry.rating >= 3 ? "#f59e0b" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Sin reseñas aún" />}
        </ChartCard>
      </div>
    </div>
  );
}
