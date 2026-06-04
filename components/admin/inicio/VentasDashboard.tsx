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
// DashboardSectionHeader removido 2026-04-24 — ver decision en render body.
import { BulejeDashboardSkeleton } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";

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
  ventasPorDia: { dia: string; total: number; prev: number; promedio: number; isWeekend: boolean }[];
  dateRangeLabel: string;
  weekendBand: { x1: string; x2: string } | null;
  nextDayPrediction: { dia: string; diaCompleto: string; estimado: number } | null;
  forecast7: { dia: string; estimado: number }[];
  wowGrowth: number | null;
  topHoras: { hora: number; total: number }[];
  // Funnel
  funnelPedidos: { etapa: string; cantidad: number; color: string }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
const PAY_COLORS: Record<string, string> = { efectivo: "#10b981", yape: "#8b5cf6", plin: "#06b6d4", tarjeta: "#3b82f6", transferencia: "#f59e0b" };
const PAY_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia" };

// ── Main Component ───────────────────────────────────────────────────────────

export default function VentasDashboard({ dateRange, onChangeRange }: { dateRange: DateRange; onChangeRange?: (r: DateRange) => void }) {
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
    const mOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= monthStart && new Date(o.createdAt) <= monthEnd);
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
    const pOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= prevMonthStart && new Date(o.createdAt) <= prevMonthEnd);
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
    const ventasHoy = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status === "entregado").reduce((a, o) => a + o.total, 0)
      + sales.filter(s => new Date(s.createdAt).toDateString() === todayStr).reduce((a, s) => a + s.total, 0);
    const ventasAyer = orders.filter(o => new Date(o.createdAt).toDateString() === yesterday.toDateString() && o.status === "entregado").reduce((a, o) => a + o.total, 0)
      + sales.filter(s => new Date(s.createdAt).toDateString() === yesterday.toDateString()).reduce((a, s) => a + s.total, 0);

    // Sparklines last 7 days
    const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (6 - i)); return dateKey(d.toISOString()); });
    const dailyVentasMap = new Map<string, number>();
    const dailyProfitMap = new Map<string, number>();
    const dailyTicketsMap = new Map<string, number>();
    // SECURITY 2026-05-16 (P0 double-count fix): antes hacía
    // [...mOrders, ...orders.filter(>=14d)] — las órdenes en el solapamiento
    // (mes actual ∩ últimos 14 días) se contaban DOS veces en sparkline,
    // ventasDiarias y dailyProfitMap. Bug crítico: distorsionaba el KPI
    // que el bodeguero usa para decidir.
    // Fix: una sola fuente — orders filtradas por (entregado + últimos 14d).
    // mOrders ya no se usa aquí para los daily maps.
    orders
      .filter((o) => o.status === "entregado" && new Date(o.createdAt) >= new Date(now.getTime() - 14 * 86400000))
      .map((o) => ({ date: o.createdAt, total: o.total, items: o.items }))
      .forEach(t => {
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
    [...orders.filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status === "entregado"),
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

    // Sales by day-of-week — Brandon mayo 2026: empezamos siempre en Lunes
    // (índice 0 = Lun, 6 = Dom). getDay() retorna 0=Dom..6=Sáb, así que
    // remapeamos: Dom(0)→6, Lun(1)→0, ..., Sáb(6)→5.
    const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const DAYS_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const dowToIdx = (d: number) => (d === 0 ? 6 : d - 1);
    const dowMap = new Map<number, number>();
    [...mOrders, ...mSales].forEach(t => {
      const idx = dowToIdx(new Date(t.createdAt).getDay());
      dowMap.set(idx, (dowMap.get(idx) ?? 0) + t.total);
    });
    // Brandon mayo 2026: comparativa con periodo previo equivalente para
    // gráfico de día de semana — barras dobles "esta sem vs sem previa".
    const dowMapPrev = new Map<number, number>();
    [...pOrders, ...pSales].forEach(t => {
      const idx = dowToIdx(new Date(t.createdAt).getDay());
      dowMapPrev.set(idx, (dowMapPrev.get(idx) ?? 0) + t.total);
    });
    const totalActivos = Array.from({ length: 7 }, (_, i) => dowMap.get(i) ?? 0);
    const sumActivos = totalActivos.reduce((s, v) => s + v, 0);
    const countActivos = totalActivos.filter((v) => v > 0).length;
    const promedioDow = countActivos > 0 ? sumActivos / countActivos : 0;
    const ventasPorDia = Array.from({ length: 7 }, (_, i) => ({
      dia: DAYS[i],
      total: dowMap.get(i) ?? 0,
      prev: dowMapPrev.get(i) ?? 0,
      promedio: Math.round(promedioDow * 100) / 100,
      isWeekend: i >= 5, // Sáb (5) y Dom (6)
    }));
    // Banda visual para fin de semana — si hay datos en Sáb o Dom.
    const weekendBand =
      ventasPorDia[5].total > 0 || ventasPorDia[6].total > 0
        ? { x1: "Sáb", x2: "Dom" }
        : null;
    // Predicción próximo día — usamos el promedio histórico de ese día
    // de la semana en el rango (simple, explicable, sin sorpresas).
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tIdx = dowToIdx(tomorrow.getDay());
    const tEstimado = dowMap.get(tIdx) ?? 0;
    const nextDayPrediction = tEstimado > 0
      ? { dia: DAYS[tIdx], diaCompleto: DAYS_FULL[tIdx], estimado: Math.round(tEstimado / Math.max(1, Math.ceil(rangeDays / 7))) }
      : null;
    // Brandon mayo 2026: label legible del rango activo, ej: "11 may – 17 may"
    // o "1 may – 31 may". Se inyecta en VentasData para que los charts lo
    // muestren en su header.
    const fmtDay = (d: Date) =>
      d.toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(/\./g, "");
    const dateRangeLabel = `${fmtDay(monthStart)} – ${fmtDay(monthEnd)}`;

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
      { etapa: "Entregados", cantidad: allPeriodOrders.filter(o => o.status === "entregado").length, color: "var(--accent)" },
    ];

    return {
      ventasNetas, utilidadBruta, margen, tickets, ticketPromedio, cancelados: cancelled.length,
      ventasHoy, ventasAyer,
      dVentas: pctD(ventasNetas, prevVentas), dUtilidad: pctD(utilidadBruta, prevUtilidad),
      dTickets: pctD(tickets, prevTickets), dMargen: pctD(margen, prevMargen),
      dTicketProm: pctD(ticketPromedio, prevTicketProm), dCancelados: pctD(cancelled.length, pCancelled.length),
      sparkVentas, sparkUtilidad, sparkTickets,
      ventasDiarias, ventasPorHora, metodosPago, ventasPorDia, dateRangeLabel, weekendBand, nextDayPrediction, forecast7, wowGrowth, topHoras,
      funnelPedidos,
    };
  }, [raw, dateRange]);

  if (loading) return <BulejeDashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
      <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  // Empty state: no hubo ventas en el rango seleccionado
  if (data.ventasNetas === 0 && data.tickets === 0) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="ventas"
        onChangeRange={onChangeRange}
        action={{ label: "Registrar venta manual", href: "/admin?tab=ventas-caja" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 2026-04-24: DashboardSectionHeader removido por decision UX —
          los KPI tiles + charts comunican el contenido sin necesidad del
          eyebrow + titulo + subtitulo descriptivos arriba. */}

      {/* ── KPI Hero Row · ADR-068 UnifiedKPITile (armonía estricta) — con sparklines ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ventas Netas" value={fmt(data.ventasNetas)} icon={DollarSign} delta={data.dVentas} sparkline={data.sparkVentas.length >= 2 ? { data: data.sparkVentas } : undefined} />
        <StatCard label="Utilidad Bruta" value={fmt(data.utilidadBruta)} icon={TrendingUp} delta={data.dUtilidad} sparkline={data.sparkUtilidad.length >= 2 ? { data: data.sparkUtilidad } : undefined} />
        <StatCard label="Margen" value={`${Number(data.margen).toFixed(1)}%`} icon={Percent} delta={data.dMargen} emphasis={data.margen >= 25 ? "success" : data.margen >= 15 ? "warning" : "error"} />
        <StatCard label="Tickets" value={String(data.tickets)} icon={Receipt} delta={data.dTickets} sparkline={data.sparkTickets.length >= 2 ? { data: data.sparkTickets } : undefined} />
        <StatCard label="Ticket Prom." value={fmt(data.ticketPromedio)} icon={ShoppingCart} delta={data.dTicketProm} />
        <StatCard label="Cancelados" value={String(data.cancelados)} icon={AlertTriangle} delta={data.dCancelados} emphasis={data.cancelados > 0 ? "error" : "neutral"} />
      </div>

      {/* ── Today vs Yesterday mini bar ── */}
      <div className="flex items-center gap-3 bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl px-5 py-3">
        <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
        <div className="flex-1 flex items-center gap-4 text-sm">
          <span className="text-[var(--text-secondary)] dark:text-muted">Hoy:</span>
          <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(data.ventasHoy)}</span>
          <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">|</span>
          <span className="text-[var(--text-secondary)] dark:text-muted">Ayer:</span>
          <span className="font-semibold text-[var(--text-secondary)]">{fmt(data.ventasAyer)}</span>
          {data.ventasAyer > 0 && (
            <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-md", data.ventasHoy >= data.ventasAyer ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] text-[var(--data-error-500)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]")}>
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
