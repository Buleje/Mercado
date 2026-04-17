"use client";

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  AreaChart, Area,
} from "recharts";
import { BarChart3, Truck, AlertTriangle, Clock, CreditCard, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComprasData } from "./ComprasDashboard";

const BRAND = "#00B4A6";

function ChartTooltip({ active, payload, label, prefix = "" }: {
  active?: boolean; payload?: { name?: string; value: number; color?: string; fill?: string }[]; label?: string; prefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 dark:text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill || BRAND }} />
          <span className="text-gray-500 dark:text-muted">{p.name}:</span>
          <span className="font-bold text-gray-900 dark:text-foreground">{prefix}{typeof p.value === "number" ? `S/ ${p.value.toFixed(2)}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, Icon, children, className }: {
  title: string; Icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl p-5 ", className)}>
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

export default function ComprasCharts({ data }: { data: ComprasData }) {
  return (
    <div className="space-y-5">
      {/* Row 1: Compras diarias + Por proveedor */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Compras en el período" Icon={DollarSign} className="lg:col-span-3">
          {data.comprasDiarias.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.comprasDiarias}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="total" name="Compras" fill={BRAND} fillOpacity={0.15} stroke={BRAND} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Sin compras en el período" />}
        </ChartCard>

        <ChartCard title="Por proveedor" Icon={Truck} className="lg:col-span-2">
          {data.comprasPorProveedor.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.comprasPorProveedor} dataKey="total" nameKey="nombre" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} strokeWidth={0}>
                    {data.comprasPorProveedor.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                {data.comprasPorProveedor.slice(0, 5).map((p, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-gray-500 dark:text-muted">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    {p.nombre}
                  </span>
                ))}
              </div>
            </div>
          ) : <EmptyState text="Sin proveedores" />}
        </ChartCard>
      </div>

      {/* Row 2: Estado de cuentas + Cuentas por vencer */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Estado de cuentas por pagar" Icon={CreditCard}>
          {data.estadoCuentas.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.estadoCuentas} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="estado" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="monto" name="Monto" radius={[6, 6, 0, 0]}>
                  {data.estadoCuentas.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
              <CreditCard className="h-8 w-8 mb-2" />
              <p className="text-xs font-medium">Sin cuentas pendientes</p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Cuentas próximas a vencer" Icon={Clock}>
          {data.cuentasPorVencer.length > 0 ? (
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {data.cuentasPorVencer.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{c.nombre}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-bold text-gray-900 dark:text-foreground">S/ {c.monto.toFixed(2)}</span>
                    <span className={cn(
                      "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded whitespace-nowrap",
                      c.status === "vencido" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                        : c.status === "urgente" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                        : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                    )}>
                      {c.diasRestantes < 0 ? `${Math.abs(c.diasRestantes)}d atrás` : `${c.diasRestantes}d`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
              <AlertTriangle className="h-8 w-8 mb-2" />
              <p className="text-xs font-medium">Sin cuentas pendientes</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Row 3: Compras mensuales + Top proveedores */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Compras mensuales" Icon={BarChart3}>
          {data.comprasMensuales.some(c => c.total > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.comprasMensuales} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Compras" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Top proveedores (histórico)" Icon={Truck}>
          {data.topProveedores.length > 0 ? (
            <div className="space-y-3">
              {data.topProveedores.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0",
                    i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                  )}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.nombre}</p>
                    <p className="text-[length:var(--ts-2xs)] text-gray-400">{p.ordenes} órdenes</p>
                  </div>
                  <span className="text-xs font-bold text-gray-900 dark:text-foreground shrink-0">S/ {p.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Sin historial de compras" />}
        </ChartCard>
      </div>
    </div>
  );
}
