"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo } from "react";
import {
  DollarSign, TrendingUp, Receipt,
  AlertTriangle, RefreshCw, ShoppingCart,
  Percent, Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";
const VentasCharts = dynamic(() => import("./VentasCharts"), { ssr: false });
const VentasAdvancedCharts = dynamic(
  () => import("./VentasAdvancedCharts").then((m) => ({ default: m.VentasAdvancedCharts })),
  { ssr: false },
);
import { DashboardSectionHeader, BulejeDashboardSkeleton } from "./_shared";

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
      { etapa: "Entregados", cantidad: allPeriodOrders.filter(o => o.status === "entregado").length, color: "#00B4A6" },
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

  if (loading) return <BulejeDashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning)]" />
      <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-6">
      <DashboardSectionHeader
        eyebrow="Dashboard · Ventas y utilidad"
        title="Tu negocio en"
        titleAccent="ingresos"
        subtitle="Ventas netas, margen y tickets del periodo. Miralo todos los días para saber si estás ganando."
      />

      {/* ── KPI Hero Row · ADR-068 UnifiedKPITile (armonía estricta) — con sparklines ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ventas Netas" value={fmt(data.ventasNetas)} icon={DollarSign} delta={data.dVentas} sparkline={data.sparkVentas.length >= 2 ? { data: data.sparkVentas } : undefined} />
        <StatCard label="Utilidad Bruta" value={fmt(data.utilidadBruta)} icon={TrendingUp} delta={data.dUtilidad} sparkline={data.sparkUtilidad.length >= 2 ? { data: data.sparkUtilidad } : undefined} />
        <StatCard label="Margen" value={`${data.margen.toFixed(1)}%`} icon={Percent} delta={data.dMargen} emphasis={data.margen >= 25 ? "success" : data.margen >= 15 ? "warning" : "error"} />
        <StatCard label="Tickets" value={String(data.tickets)} icon={Receipt} delta={data.dTickets} sparkline={data.sparkTickets.length >= 2 ? { data: data.sparkTickets } : undefined} />
        <StatCard label="Ticket Prom." value={fmt(data.ticketPromedio)} icon={ShoppingCart} delta={data.dTicketProm} />
        <StatCard label="Cancelados" value={String(data.cancelados)} icon={AlertTriangle} delta={data.dCancelados} emphasis={data.cancelados > 0 ? "error" : "neutral"} />
      </div>

      {/* ── Today vs Yesterday mini bar ── */}
      <div className="flex items-center gap-3 bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl px-5 py-3">
        <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
        <div className="flex-1 flex items-center gap-4 text-sm">
          <span className="text-[var(--text-secondary)] dark:text-muted">Hoy:</span>
          <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(data.ventasHoy)}</span>
          <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">|</span>
          <span className="text-[var(--text-secondary)] dark:text-muted">Ayer:</span>
          <span className="font-semibold text-[var(--text-secondary)]">{fmt(data.ventasAyer)}</span>
          {data.ventasAyer > 0 && (
            <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-md", data.ventasHoy >= data.ventasAyer ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" : "bg-[var(--data-error-50)] text-[var(--data-error)] dark:bg-red-950/30 dark:text-[var(--data-error)]")}>
              {data.ventasHoy >= data.ventasAyer ? "↑" : "↓"} {Math.abs(((data.ventasHoy - data.ventasAyer) / data.ventasAyer) * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {refreshing && <RefreshCw className="h-3.5 w-3.5 text-[var(--text-tertiary)] animate-spin" />}
      </div>

      {/* ── Charts base (14d, hora, método pago, meta, forecast) ── */}
      <VentasCharts data={data} />

      {/* ── Charts especializados de ventas (Pareto, heatmap, waterfall, mix, comparativa) ── */}
      <VentasAdvancedCharts />
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-32" />
        ))}
      </div>
      <div className="bg-[var(--surface-sunken)] rounded-xl h-12" />
      <div className="bg-[var(--surface-sunken)] rounded-xl h-[380px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[300px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[300px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[260px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[260px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[260px]" />
      </div>
    </div>
  );
}
