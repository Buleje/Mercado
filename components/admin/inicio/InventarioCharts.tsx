"use client";

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Area, Line,
} from "recharts";
import { BarChart3, Package, AlertTriangle, Layers, ShoppingCart, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InventarioData } from "./InventarioDashboard";

// ── Colors ───────────────────────────────────────────────────────────────────
const BRAND = "#00B4A6";

// ── Shared ───────────────────────────────────────────────────────────────────

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
          <span className="font-bold text-gray-900 dark:text-foreground">{prefix}{typeof p.value === "number" ? p.value.toLocaleString("es-PE") : p.value}</span>
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

// ── Main Charts ──────────────────────────────────────────────────────────────

export default function InventarioCharts({ data }: { data: InventarioData }) {
  return (
    <div className="space-y-5">
      {/* Row 1: Stock por categoría + Distribución */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Valor de stock por categoría" Icon={Layers} className="lg:col-span-3">
          {data.stockPorCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.stockPorCategoria} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <Tooltip content={<ChartTooltip prefix="S/ " />} />
                <Bar dataKey="valor" name="Valor" radius={[6, 6, 0, 0]}>
                  {data.stockPorCategoria.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Distribución de stock" Icon={BarChart3} className="lg:col-span-2">
          {data.distribucionStock.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.distribucionStock} dataKey="cantidad" nameKey="rango" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} strokeWidth={0}>
                    {data.distribucionStock.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {data.distribucionStock.map((d, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-gray-500 dark:text-muted">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    {d.rango} ({d.cantidad})
                  </span>
                ))}
              </div>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      </div>

      {/* Row 2: Movimiento diario + Proyección agotamiento */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Movimiento diario (salidas)" Icon={ShoppingCart}>
          {data.movimientoDiario.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data.movimientoDiario}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="salidas" name="Salidas" fill="#ef4444" fillOpacity={0.1} stroke="#ef4444" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Sin movimientos en el período" />}
        </ChartCard>

        <ChartCard title="Proyección de agotamiento" Icon={AlertTriangle}>
          {data.proyeccionAgotamiento.length > 0 ? (
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto">
              {data.proyeccionAgotamiento.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.nombre}</p>
                      <span className={cn(
                        "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded whitespace-nowrap",
                        p.status === "critico" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                          : p.status === "alerta" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                      )}>
                        {p.diasRestantes}d
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full",
                          p.status === "critico" ? "bg-red-500" : p.status === "alerta" ? "bg-amber-500" : "bg-emerald-500"
                        )} style={{ width: `${Math.min((p.diasRestantes / 30) * 100, 100)}%` }} />
                      </div>
                      <span className="text-[length:var(--ts-2xs)] text-gray-400 whitespace-nowrap">{p.stock} uds</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
              <Package className="h-8 w-8 mb-2" />
              <p className="text-xs font-medium">Stock saludable</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Row 3: Productos críticos + Top salidas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Productos para reponer" Icon={AlertTriangle}>
          {data.productosCriticos.length > 0 ? (
            <div className="space-y-2">
              {data.productosCriticos.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.nombre}</p>
                    <p className="text-[length:var(--ts-2xs)] text-gray-400">{p.categoria}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-bold text-red-600 dark:text-red-400">{p.stock}/{p.stockMin}</p>
                      <p className="text-[length:var(--ts-2xs)] text-gray-400">Pedir {p.reorder} uds</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
              <Package className="h-8 w-8 mb-2" />
              <p className="text-xs font-medium">Sin productos críticos</p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Top salidas del período" Icon={TrendingUp}>
          {data.topSalidas.length > 0 ? (
            <div className="space-y-2">
              {data.topSalidas.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0",
                      i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                    )}>{i + 1}</span>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.nombre}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-gray-900 dark:text-foreground">{p.unidades} uds</span>
                    {p.tendencia === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                    {p.tendencia === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Sin ventas en el período" />}
        </ChartCard>
      </div>
    </div>
  );
}
