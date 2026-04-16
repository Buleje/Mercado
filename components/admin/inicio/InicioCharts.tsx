"use client";

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  RadialBarChart, RadialBar, ComposedChart,
} from "recharts";
import { BarChart3, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./InicioDashboard";

// ── Color tokens ─────────────────────────────────────────────────────────────
const BRAND = "#00B4A6";
const BRAND_LIGHT = "#33C4B8";
const BLUE = "#3b82f6";
const ORANGE = "#f97316";
const EMERALD = "#10b981";
const VIOLET = "#8b5cf6";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const CYAN = "#06b6d4";
const GRAY = "#94a3b8";

// ── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active, payload, label, prefix = "S/",
}: {
  active?: boolean;
  payload?: { name?: string; value: number; color?: string; fill?: string }[];
  label?: string;
  prefix?: string;
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

// ── Chart Card wrapper ───────────────────────────────────────────────────────

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl p-5 shadow-sm", className)}>
      <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ── Main Charts Component ────────────────────────────────────────────────────

export default function InicioCharts({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-5">
      {/* ── Row 1: Revenue trend + Category pie ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Ventas & Utilidad (area chart) */}
        <ChartCard title="Ventas y Utilidad" className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.ventasDiarias}>
              <defs>
                <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BLUE} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUtilidad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={EMERALD} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={EMERALD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="ventas" name="Ventas" stroke={BLUE} fill="url(#gradVentas)" strokeWidth={2.5} dot={false} />
              <Area type="monotone" dataKey="utilidad" name="Utilidad" stroke={EMERALD} fill="url(#gradUtilidad)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Ventas por categoría (donut) */}
        <ChartCard title="Ventas por categoría" className="lg:col-span-2">
          {data.ventasPorCategoria.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.ventasPorCategoria}
                    dataKey="total"
                    nameKey="nombre"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {data.ventasPorCategoria.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {data.ventasPorCategoria.slice(0, 6).map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-muted">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    {c.nombre}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      {/* ── Row 2: Top products + Payment methods ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top 8 productos — horizontal bar */}
        <ChartCard title="Top productos">
          {data.topProductos.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.topProductos} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="ingresos" name="Ingresos" fill={BRAND} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Métodos de pago — radial bar */}
        <ChartCard title="Métodos de pago">
          {data.ventasPorMetodoPago.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.ventasPorMetodoPago} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="metodo" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="total" name="Total" radius={[6, 6, 0, 0]}>
                    {data.ventasPorMetodoPago.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {data.ventasPorMetodoPago.map((p, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-muted">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    {p.metodo}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      {/* ── Row 3: Flujo de efectivo + Horas pico + Funnel ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Cash flow */}
        <ChartCard title="Flujo de efectivo">
          {data.flujoEfectivo.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.flujoEfectivo} barGap={-2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="ingresos" name="Ingresos" fill={EMERALD} radius={[4, 4, 0, 0]} barSize={12} />
                <Bar dataKey="egresos" name="Egresos" fill={RED} radius={[4, 4, 0, 0]} barSize={12} opacity={0.7} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Ventas por hora — bar chart vertical */}
        <ChartCard title="Horas pico de venta">
          {data.ventasPorHora.some(h => h.cantidad > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.ventasPorHora} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hora" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip prefix="" />} />
                <Bar dataKey="cantidad" name="Ventas" fill={VIOLET} radius={[4, 4, 0, 0]}>
                  {data.ventasPorHora.map((entry, i) => (
                    <Cell key={i} fill={entry.cantidad === Math.max(...data.ventasPorHora.map(h => h.cantidad)) && entry.cantidad > 0 ? ORANGE : VIOLET} opacity={entry.cantidad > 0 ? 1 : 0.2} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="Sin ventas hoy aún" />
          )}
        </ChartCard>

        {/* Order funnel */}
        <ChartCard title="Embudo de pedidos">
          {data.funnelPedidos[0]?.cantidad > 0 ? (
            <div className="space-y-3 pt-2">
              {data.funnelPedidos.map((step, i) => {
                const maxCount = data.funnelPedidos[0].cantidad || 1;
                const pct = (step.cantidad / maxCount) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">{step.etapa}</span>
                      <span className="text-[11px] font-bold text-gray-900 dark:text-foreground">{step.cantidad}</span>
                    </div>
                    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: step.color }}
                      />
                    </div>
                  </div>
                );
              })}
              {data.funnelPedidos[0].cantidad > 0 && (
                <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-2">
                  Conversión: {((data.funnelPedidos[3]?.cantidad ?? 0) / data.funnelPedidos[0].cantidad * 100).toFixed(0)}% entregados
                </p>
              )}
            </div>
          ) : (
            <EmptyChart text="Sin pedidos este mes" />
          )}
        </ChartCard>
      </div>

      {/* ── Row 4: Stock alerts + Clientes por tier + Proveedores ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Stock projection */}
        <ChartCard title="Stock — proyección de agotamiento">
          {data.stockAlerta.length > 0 ? (
            <div className="space-y-2.5">
              {data.stockAlerta.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.nombre}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            p.diasRestantes < 7 ? "bg-red-500" : p.diasRestantes < 14 ? "bg-amber-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${Math.min((p.stock / Math.max(p.minimo * 3, 1)) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold whitespace-nowrap",
                        p.diasRestantes < 7 ? "text-red-600" : p.diasRestantes < 14 ? "text-amber-600" : "text-emerald-600"
                      )}>
                        {p.diasRestantes}d
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap">{p.stock} uds</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart text="Stock saludable" Icon={CheckCircle2} />
          )}
        </ChartCard>

        {/* Clientes por tier — donut */}
        <ChartCard title="Clientes por nivel">
          {data.clientesPorTier.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.clientesPorTier}
                    dataKey="cantidad"
                    nameKey="tier"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {data.clientesPorTier.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip prefix="" />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 justify-center">
                {data.clientesPorTier.map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-muted">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    {c.tier} ({c.cantidad})
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart text="Sin clientes registrados" />
          )}
        </ChartCard>

        {/* Top proveedores */}
        <ChartCard title="Compras por proveedor (mes)">
          {data.comprasPorProveedor.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.comprasPorProveedor} layout="vertical" barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
                <YAxis type="category" dataKey="proveedor" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Total" fill={CYAN} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="Sin compras este mes" />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyChart({ text = "Sin datos disponibles", Icon = BarChart3 }: { text?: string; Icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
      <Icon className="h-8 w-8 mb-2" aria-hidden="true" />
      <p className="text-xs font-medium">{text}</p>
    </div>
  );
}
