"use client";

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  ComposedChart, Line,
} from "recharts";
import { BarChart3, Target, Package, ShoppingBasket, AlertTriangle, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductosData } from "./ProductosDashboard";

// ── Colors ───────────────────────────────────────────────────────────────────
const BRAND = "#00B4A6";
const BLUE = "#3b82f6";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const VIOLET = "#8b5cf6";
const RED = "#ef4444";
const CYAN = "#06b6d4";

// ── Shared components ────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, prefix = "S/" }: {
  active?: boolean; payload?: { name?: string; value: number; color?: string; fill?: string }[]; label?: string; prefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="font-semibold text-gray-700 dark:text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill || BRAND }} />
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
  title: string; Icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string; badge?: React.ReactNode;
}) {
  return (
    <div className={cn("bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl p-5 shadow-sm", className)}>
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

export default function ProductosCharts({ data }: { data: ProductosData }) {
  return (
    <div className="space-y-5">
      {/* ── Row 1: Top 10 products + Categories ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Top 10 productos — ingresos" Icon={BarChart3} className="lg:col-span-3">
          {data.topProductos.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topProductos} layout="vertical" barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="ingresos" name="Ingresos" fill={BRAND} radius={[0, 6, 6, 0]}>
                  {data.topProductos.map((_, i) => (
                    <Cell key={i} fill={i < 3 ? BRAND : BLUE} opacity={i < 3 ? 1 : 0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Ventas por categoría" Icon={ShoppingBasket} className="lg:col-span-2">
          {data.ventasPorCategoria.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.ventasPorCategoria} dataKey="total" nameKey="nombre" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                    {data.ventasPorCategoria.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {data.ventasPorCategoria.map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-muted">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    {c.nombre}
                  </span>
                ))}
              </div>
            </div>
          ) : <EmptyState text="Sin ventas por categoría" />}
        </ChartCard>
      </div>

      {/* ── Row 2: Pareto ABC + Stock projection ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Análisis Pareto ABC (80/20)"
          Icon={Target}
          badge={
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />A</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />B</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />C</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500" />% Acum.</span>
            </div>
          }
        >
          {data.paretoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data.paretoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="nombre" tick={{ fontSize: 8, fill: "#94a3b8" }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={50} interval={0} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip />} />
                <Bar yAxisId="left" dataKey="ingresos" name="Ingresos" radius={[4, 4, 0, 0]}>
                  {data.paretoData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="acumulado" name="% Acumulado" stroke={AMBER} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Proyección de agotamiento" Icon={AlertTriangle}>
          {data.stockProjection.length > 0 ? (
            <div className="space-y-3">
              {data.stockProjection.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.nombre}</p>
                      <span className={cn(
                        "text-[10px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded",
                        p.status === "critico" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                          : p.status === "alerta" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                      )}>
                        {p.diasRestantes}d
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all",
                            p.status === "critico" ? "bg-red-500" : p.status === "alerta" ? "bg-amber-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${Math.min((p.diasRestantes / 30) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{p.stock} uds</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
              <Package className="h-8 w-8 mb-2 text-emerald-500" />
              <p className="text-xs font-medium text-emerald-600">Stock saludable</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Row 3: Without movement + Affinities ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Productos sin movimiento" Icon={Package}>
          {data.productosSinMov.length > 0 ? (
            <div className="space-y-2">
              {data.productosSinMov.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-gray-400">{p.categoria}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-gray-400">{p.stock} uds</span>
                    <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">S/ {p.precio.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
              <Package className="h-8 w-8 mb-2 text-emerald-500" />
              <p className="text-xs font-medium text-emerald-600">Todos los productos rotaron</p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Afinidades de compra" Icon={Link2}>
          {data.afinidades.length > 0 ? (
            <div className="space-y-2.5">
              {data.afinidades.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                    i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                  )}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                      <span className="font-medium">{a.productoA}</span>
                      <span className="text-gray-400 mx-1">+</span>
                      <span className="font-medium">{a.productoB}</span>
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded shrink-0">
                    {a.coCompras}x juntos
                  </span>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Sin datos de afinidad aún" />}
        </ChartCard>
      </div>
    </div>
  );
}
