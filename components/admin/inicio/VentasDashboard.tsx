"use client";

import { useMemo } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, Minus, Receipt,
  AlertTriangle, CreditCard, RefreshCw, ShoppingCart,
  Percent, ArrowUpRight, ArrowDownRight, Download, Target,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const VentasCharts = dynamic(() => import("./VentasCharts"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderItem { id: number; name: string; price: number; quantity: number; unit: string; image: string }
interface Order {
  id: string;
  customer: { name: string; phone?: string; location: string; reference: string };
  items: OrderItem[]; total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: string; createdAt: string; updatedAt: string;
}
interface Sale {
  id: string; total: number; totalCogs: number;
  payment: string; createdAt: string;
  items: { productId: number; name: string; price: number; costPrice?: number; quantity: number; unit: string }[];
}
interface Product {
  id: number; name: string; category: string;
  price: number; costPrice?: number; stock?: number; active: boolean;
}

export interface VentasData {
  // KPIs
  ventasNetas: number;
  utilidadBruta: number;
  margen: number;
  tickets: number;
  ticketPromedio: number;
  cancelados: number;
  ventasHoy: number;
  ventasAyer: number;
  // Deltas
  dVentas: number | null;
  dUtilidad: number | null;
  dTickets: number | null;
  dMargen: number | null;
  dTicketProm: number | null;
  dCancelados: number | null;
  // Sparklines
  sparkVentas: number[];
  sparkUtilidad: number[];
  sparkTickets: number[];
  // Charts
  ventasDiarias: { dia: string; ventas: number; utilidad: number; promedio7d: number }[];
  ventasPorHora: { hora: string; ventas: number; monto: number }[];
  metodosPago: { metodo: string; total: number; color: string; porcentaje: number }[];
  ventasPorDia: { dia: string; total: number }[];
  forecast7: { dia: string; estimado: number }[];
  wowGrowth: number | null;
  topHoras: { hora: number; total: number }[];
  // Funnel
  funnelPedidos: { etapa: string; cantidad: number; color: string }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }
function dateKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
const PAY_COLORS: Record<string, string> = { efectivo: "#10b981", yape: "#8b5cf6", plin: "#06b6d4", tarjeta: "#3b82f6", transferencia: "#f59e0b" };
const PAY_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia" };

// ── Main Component ───────────────────────────────────────────────────────────

export default function VentasDashboard({ dateRange }: { dateRange: DateRange }) {
  const { data: shared, loading, error, refresh } = useDashboardData();
  const refreshing = false;

  const raw = shared
    ? { products: shared.products as unknown as Product[], orders: shared.orders as unknown as Order[], sales: shared.sales as unknown as Sale[] }
    : null;

  const data = useMemo<VentasData | null>(() => {
    if (!raw) return null;
    const { products, orders, sales } = raw;
    const now = new Date();
    const { from: monthStart, to: monthEnd } = dateRange;
    const rangeDays = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000));
    const prevMonthStart = new Date(monthStart.getTime() - rangeDays * 86400000);
    const prevMonthEnd = new Date(monthStart.getTime() - 1);

    const costMap = new Map(products.map(p => [p.id, p.costPrice ?? p.price * 0.7]));

    // Current month
    const mOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= monthStart && new Date(o.createdAt) <= monthEnd);
    const mSales = sales.filter(s => new Date(s.createdAt) >= monthStart && new Date(s.createdAt) <= monthEnd);
    const cancelled = orders.filter(o => o.status === "cancelado" && new Date(o.createdAt) >= monthStart && new Date(o.createdAt) <= monthEnd);

    const ventasNetas = mOrders.reduce((a, o) => a + o.total, 0) + mSales.reduce((a, s) => a + s.total, 0);
    let costo = 0;
    mOrders.forEach(o => o.items.forEach(i => { costo += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity; }));
    mSales.forEach(s => s.items.forEach(i => { costo += (costMap.get(i.productId) ?? i.price * 0.7) * i.quantity; }));
    const utilidadBruta = ventasNetas - costo;
    const margen = ventasNetas > 0 ? (utilidadBruta / ventasNetas) * 100 : 0;
    const tickets = mOrders.length + mSales.length;
    const ticketPromedio = tickets > 0 ? ventasNetas / tickets : 0;

    // Previous month
    const pOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= prevMonthStart && new Date(o.createdAt) <= prevMonthEnd);
    const pSales = sales.filter(s => new Date(s.createdAt) >= prevMonthStart && new Date(s.createdAt) <= prevMonthEnd);
    const pCancelled = orders.filter(o => o.status === "cancelado" && new Date(o.createdAt) >= prevMonthStart && new Date(o.createdAt) <= prevMonthEnd);
    const prevVentas = pOrders.reduce((a, o) => a + o.total, 0) + pSales.reduce((a, s) => a + s.total, 0);
    let prevCosto = 0;
    pOrders.forEach(o => o.items.forEach(i => { prevCosto += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity; }));
    pSales.forEach(s => s.items.forEach(i => { prevCosto += (costMap.get(i.productId) ?? i.price * 0.7) * i.quantity; }));
    const prevUtilidad = prevVentas - prevCosto;
    const prevMargen = prevVentas > 0 ? (prevUtilidad / prevVentas) * 100 : 0;
    const prevTickets = pOrders.length + pSales.length;
    const prevTicketProm = prevTickets > 0 ? prevVentas / prevTickets : 0;

    const pctD = (c: number, p: number) => p === 0 ? null : ((c - p) / p) * 100;

    // Today / Yesterday
    const todayStr = now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const ventasHoy = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status !== "cancelado").reduce((a, o) => a + o.total, 0)
      + sales.filter(s => new Date(s.createdAt).toDateString() === todayStr).reduce((a, s) => a + s.total, 0);
    const ventasAyer = orders.filter(o => new Date(o.createdAt).toDateString() === yesterday.toDateString() && o.status !== "cancelado").reduce((a, o) => a + o.total, 0)
      + sales.filter(s => new Date(s.createdAt).toDateString() === yesterday.toDateString()).reduce((a, s) => a + s.total, 0);

    // Sparklines last 7 days
    const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (6 - i)); return dateKey(d.toISOString()); });
    const dailyVentasMap = new Map<string, number>();
    const dailyProfitMap = new Map<string, number>();
    const dailyTicketsMap = new Map<string, number>();
    [...mOrders.map(o => ({ date: o.createdAt, total: o.total, items: o.items })),
    ...orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= new Date(now.getTime() - 14 * 86400000)).map(o => ({ date: o.createdAt, total: o.total, items: o.items }))
    ].forEach(t => {
      const k = dateKey(t.date);
      dailyVentasMap.set(k, (dailyVentasMap.get(k) ?? 0) + t.total);
      dailyTicketsMap.set(k, (dailyTicketsMap.get(k) ?? 0) + 1);
      let c = 0; t.items.forEach(i => { c += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity; });
      dailyProfitMap.set(k, (dailyProfitMap.get(k) ?? 0) + (t.total - c));
    });
    sales.filter(s => new Date(s.createdAt) >= new Date(now.getTime() - 14 * 86400000)).forEach(s => {
      const k = dateKey(s.createdAt);
      dailyVentasMap.set(k, (dailyVentasMap.get(k) ?? 0) + s.total);
      dailyTicketsMap.set(k, (dailyTicketsMap.get(k) ?? 0) + 1);
      let c = 0; s.items.forEach(i => { c += (costMap.get(i.productId) ?? i.price * 0.7) * i.quantity; });
      dailyProfitMap.set(k, (dailyProfitMap.get(k) ?? 0) + (s.total - c));
    });
    const sparkVentas = last7.map(k => dailyVentasMap.get(k) ?? 0);
    const sparkUtilidad = last7.map(k => dailyProfitMap.get(k) ?? 0);
    const sparkTickets = last7.map(k => dailyTicketsMap.get(k) ?? 0);

    // Daily chart (14 days)
    const last14 = Array.from({ length: 14 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (13 - i)); return dateKey(d.toISOString()); });
    const ventasDiarias = last14.map((k, idx) => {
      const v = dailyVentasMap.get(k) ?? 0;
      const u = dailyProfitMap.get(k) ?? 0;
      const start = Math.max(0, idx - 6);
      const window = last14.slice(start, idx + 1).map(dk => dailyVentasMap.get(dk) ?? 0);
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      return { dia: dayLabel(k), ventas: v, utilidad: u, promedio7d: Math.round(avg * 100) / 100 };
    });

    // Week-over-week
    const weekTotal = last14.slice(-7).reduce((a, k) => a + (dailyVentasMap.get(k) ?? 0), 0);
    const prevWeekTotal = last14.slice(0, 7).reduce((a, k) => a + (dailyVentasMap.get(k) ?? 0), 0);
    const wowGrowth = prevWeekTotal > 0 ? ((weekTotal - prevWeekTotal) / prevWeekTotal) * 100 : null;

    // Sales by hour (today)
    const hourCounts = new Map<number, { ventas: number; monto: number }>();
    [...orders.filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status !== "cancelado"),
    ...sales.filter(s => new Date(s.createdAt).toDateString() === todayStr)
    ].forEach(t => {
      const h = new Date(t.createdAt).getHours();
      const e = hourCounts.get(h) ?? { ventas: 0, monto: 0 };
      e.ventas++; e.monto += ('total' in t) ? t.total : 0;
      hourCounts.set(h, e);
    });
    const ventasPorHora = Array.from({ length: 14 }, (_, i) => i + 7).map(h => ({
      hora: `${h}:00`,
      ventas: hourCounts.get(h)?.ventas ?? 0,
      monto: hourCounts.get(h)?.monto ?? 0,
    }));
    const topHoras = [...hourCounts.entries()].sort((a, b) => b[1].monto - a[1].monto).slice(0, 3).map(([h, v]) => ({ hora: h, total: v.monto }));

    // Payment methods
    const payMap = new Map<string, number>();
    mOrders.forEach(o => { const m = o.paymentMethod ?? "efectivo"; payMap.set(m, (payMap.get(m) ?? 0) + o.total); });
    mSales.forEach(s => { const m = s.payment ?? "efectivo"; payMap.set(m, (payMap.get(m) ?? 0) + s.total); });
    const payTotal = [...payMap.values()].reduce((a, b) => a + b, 0);
    const metodosPago = [...payMap.entries()].map(([m, t]) => ({
      metodo: PAY_LABELS[m] ?? m,
      total: t,
      color: PAY_COLORS[m] ?? "#94a3b8",
      porcentaje: payTotal > 0 ? (t / payTotal) * 100 : 0,
    })).sort((a, b) => b.total - a.total);

    // Sales by day-of-week
    const dowMap = new Map<number, number>();
    const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    [...mOrders, ...mSales].forEach(t => { const d = new Date(t.createdAt).getDay(); dowMap.set(d, (dowMap.get(d) ?? 0) + t.total); });
    const ventasPorDia = Array.from({ length: 7 }, (_, i) => ({ dia: DAYS[i], total: dowMap.get(i) ?? 0 }));

    // 7-day forecast (linear regression)
    const vals = ventasDiarias.map(d => d.ventas);
    const n = vals.length;
    let slope = 0, intercept = 0;
    if (n >= 2) {
      const xMean = (n - 1) / 2;
      const yMean = vals.reduce((a, b) => a + b, 0) / n;
      const ssXY = vals.reduce((a, y, i) => a + (i - xMean) * (y - yMean), 0);
      const ssXX = vals.reduce((a, _, i) => a + (i - xMean) ** 2, 0);
      slope = ssXX !== 0 ? ssXY / ssXX : 0;
      intercept = yMean - slope * xMean;
    }
    const forecast7 = Array.from({ length: 7 }, (_, i) => {
      const fd = new Date(now); fd.setDate(fd.getDate() + i + 1);
      return { dia: dayLabel(dateKey(fd.toISOString())), estimado: Math.max(0, Math.round((intercept + slope * (n + i)) * 100) / 100) };
    });

    // Order funnel
    const allPeriodOrders = orders.filter(o => new Date(o.createdAt) >= monthStart && new Date(o.createdAt) <= monthEnd);
    const funnelPedidos = [
      { etapa: "Recibidos", cantidad: allPeriodOrders.length, color: "#3b82f6" },
      { etapa: "Confirmados", cantidad: allPeriodOrders.filter(o => ["confirmado", "en_camino", "entregado"].includes(o.status)).length, color: "#06b6d4" },
      { etapa: "En camino", cantidad: allPeriodOrders.filter(o => ["en_camino", "entregado"].includes(o.status)).length, color: "#f59e0b" },
      { etapa: "Entregados", cantidad: allPeriodOrders.filter(o => o.status === "entregado").length, color: "#10b981" },
    ];

    return {
      ventasNetas, utilidadBruta, margen, tickets, ticketPromedio, cancelados: cancelled.length,
      ventasHoy, ventasAyer,
      dVentas: pctD(ventasNetas, prevVentas), dUtilidad: pctD(utilidadBruta, prevUtilidad),
      dTickets: pctD(tickets, prevTickets), dMargen: pctD(margen, prevMargen),
      dTicketProm: pctD(ticketPromedio, prevTicketProm), dCancelados: pctD(cancelled.length, pCancelled.length),
      sparkVentas, sparkUtilidad, sparkTickets,
      ventasDiarias, ventasPorHora, metodosPago, ventasPorDia, forecast7, wowGrowth, topHoras,
      funnelPedidos,
    };
  }, [raw, dateRange]);

  if (loading) return <DashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
      <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* ── KPI Hero Row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard label="Ventas Netas" value={fmt(data.ventasNetas)} Icon={DollarSign} delta={data.dVentas} sparkline={data.sparkVentas} accent="emerald" />
        <KPICard label="Utilidad Bruta" value={fmt(data.utilidadBruta)} Icon={TrendingUp} delta={data.dUtilidad} sparkline={data.sparkUtilidad} accent="blue" />
        <KPICard label="Margen" value={`${data.margen.toFixed(1)}%`} Icon={Percent} delta={data.dMargen} accent={data.margen >= 25 ? "emerald" : data.margen >= 15 ? "amber" : "red"} />
        <KPICard label="Tickets" value={String(data.tickets)} Icon={Receipt} delta={data.dTickets} sparkline={data.sparkTickets} accent="violet" />
        <KPICard label="Ticket Prom." value={fmt(data.ticketPromedio)} Icon={ShoppingCart} delta={data.dTicketProm} accent="cyan" />
        <KPICard label="Cancelados" value={String(data.cancelados)} Icon={AlertTriangle} delta={data.dCancelados} invertTrend accent="red" />
      </div>

      {/* ── Today vs Yesterday mini bar ── */}
      <div className="flex items-center gap-3 bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl px-5 py-3">
        <Clock className="h-4 w-4 text-gray-400" />
        <div className="flex-1 flex items-center gap-4 text-sm">
          <span className="text-gray-500 dark:text-muted">Hoy:</span>
          <span className="font-bold text-gray-900 dark:text-foreground">{fmt(data.ventasHoy)}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-gray-500 dark:text-muted">Ayer:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{fmt(data.ventasAyer)}</span>
          {data.ventasAyer > 0 && (
            <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-md", data.ventasHoy >= data.ventasAyer ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400")}>
              {data.ventasHoy >= data.ventasAyer ? "↑" : "↓"} {Math.abs(((data.ventasHoy - data.ventasAyer) / data.ventasAyer) * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {refreshing && <RefreshCw className="h-3.5 w-3.5 text-gray-400 animate-spin" />}
      </div>

      {/* ── Charts ── */}
      <VentasCharts data={data} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, Icon, delta, sparkline, accent, invertTrend }: {
  label: string; value: string;
  Icon: React.ComponentType<{ className?: string }>;
  delta?: number | null; sparkline?: number[];
  accent: "emerald" | "blue" | "violet" | "cyan" | "amber" | "red";
  invertTrend?: boolean;
}) {
  const isPositive = delta != null ? (invertTrend ? delta <= 0 : delta >= 0) : false;
  const colorMap = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-500", spark: "#10b981" },
    blue: { bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-500", spark: "#3b82f6" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/30", icon: "text-violet-500", spark: "#8b5cf6" },
    cyan: { bg: "bg-cyan-50 dark:bg-cyan-950/30", icon: "text-cyan-500", spark: "#06b6d4" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/30", icon: "text-amber-500", spark: "#f59e0b" },
    red: { bg: "bg-red-50 dark:bg-red-950/30", icon: "text-red-500", spark: "#ef4444" },
  };
  const c = colorMap[accent];

  return (
    <div className="relative bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-4 overflow-hidden hover:shadow-sm transition-shadow">
      {delta != null && Math.abs(delta) >= 10 && (
        <div className={cn("absolute top-0 left-0 right-0 h-1", isPositive ? "bg-emerald-500" : "bg-red-500")} />
      )}
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", c.bg)}>
          <Icon className={cn("h-4.5 w-4.5", c.icon)} />
        </div>
        {delta != null && (
          <div className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold",
            isPositive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
          )}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-foreground tabular-nums leading-none mb-1">{value}</p>
      <p className="text-[11px] font-medium text-gray-400 dark:text-muted">{label}</p>
      {sparkline && sparkline.length > 0 && (
        <div className="mt-2">
          <MiniSparkline data={sparkline} color={c.spark} />
        </div>
      )}
    </div>
  );
}

// ── Mini Sparkline ───────────────────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((val, i) => `${(i / (data.length - 1)) * 100},${28 - ((val - min) / range) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" className="w-full h-7 opacity-50">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-xl h-32" />
        ))}
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-xl h-12" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 bg-gray-100 dark:bg-gray-800 rounded-xl h-72" />
        <div className="lg:col-span-2 bg-gray-100 dark:bg-gray-800 rounded-xl h-72" />
      </div>
    </div>
  );
}
