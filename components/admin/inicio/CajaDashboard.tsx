"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo } from "react";
import {
  Banknote, DollarSign,
  AlertTriangle, Percent, ArrowDownToLine, ArrowUpFromLine, Wallet,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { buildCostLookup, aggregateMargin } from "@/lib/chart-helpers";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const CajaCharts = dynamic(() => import("./CajaCharts"), { ssr: false });
const CajaAdvancedCharts = dynamic(
  () => import("./CajaAdvancedCharts").then((m) => ({ default: m.CajaAdvancedCharts })),
  { ssr: false },
);
// DashboardSectionHeader removido 2026-04-24 — ver decision en render body.
import { BulejeDashboardSkeleton } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";

// ── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: string; total: number; status: string; paymentMethod?: string; createdAt: string;
  items: { id: number; price: number; quantity: number }[];
}
interface Sale {
  id: string; total: number; totalCogs: number; payment: string; createdAt: string;
  items: { productId: number; price: number; costPrice?: number; quantity: number }[];
}
interface Product {
  id: number; price: number; costPrice?: number;
}
interface Purchase {
  id: string; total: number; createdAt?: string;
}

export interface CajaData {
  // KPIs
  ingresos: number;
  egresos: number;
  balance: number;
  utilidadNeta: number;
  margenNeto: number;
  ticketsTotal: number;
  // Deltas
  dIngresos: number | null;
  dEgresos: number | null;
  dBalance: number | null;
  // Charts
  flujoDiario: { dia: string; ingresos: number; egresos: number; balance: number }[];
  metodosPago: { metodo: string; monto: number; porcentaje: number; color: string }[];
  flujoMensual: { mes: string; ingresos: number; egresos: number }[];
  waterfall: { concepto: string; monto: number; tipo: "ingreso" | "egreso" | "balance"; color: string }[];
  forecast7: { dia: string; ingreso: number; egreso: number }[];
  ingresosPorHora: { hora: string; monto: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
const PAY_COLORS: Record<string, string> = { efectivo: "#10b981", yape: "#8b5cf6", plin: "#06b6d4", tarjeta: "#3b82f6", transferencia: "#f59e0b" };
const PAY_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia" };

// ── Main Component ───────────────────────────────────────────────────────────

interface CajaDashboardProps {
  dateRange: DateRange;
  onChangeRange?: (r: DateRange) => void;
}

export default function CajaDashboard({ dateRange, onChangeRange }: CajaDashboardProps) {
  const { data: shared, loading, error, refresh } = useDashboardData();

  const raw = shared
    ? {
        products: shared.products as unknown as Product[],
        orders: shared.orders as unknown as Order[],
        sales: shared.sales as unknown as Sale[],
        purchases: shared.purchases as unknown as Purchase[],
      }
    : null;

  const data = useMemo<CajaData | null>(() => {
    if (!raw) return null;
    const { products, orders, sales, purchases } = raw;
    const { from, to } = dateRange;
    const now = new Date();

    const cost = buildCostLookup(products);

    // Filter by date
    const pOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= from && new Date(o.createdAt) <= to);
    const pSales = sales.filter(s => new Date(s.createdAt) >= from && new Date(s.createdAt) <= to);
    const pPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= from && new Date(p.createdAt) <= to);

    // Previous period
    const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
    const prevTo = new Date(from.getTime() - 1);
    const prevOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= prevFrom && new Date(o.createdAt) <= prevTo);
    const prevSales = sales.filter(s => new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);
    const prevPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= prevFrom && new Date(p.createdAt) <= prevTo);

    // KPIs
    const ingresos = pOrders.reduce((a, o) => a + o.total, 0) + pSales.reduce((a, s) => a + s.total, 0);
    const egresos = pPurchases.reduce((a, p) => a + p.total, 0);
    const balance = ingresos - egresos;
    // COGS a costo REAL (helper único, sin fabricar price*0.7).
    const costo = aggregateMargin([
      ...pOrders.flatMap(o => o.items.map(i => ({ productId: i.id, quantity: i.quantity, price: i.price }))),
      ...pSales.flatMap(s => s.items.map(i => ({ productId: i.productId, quantity: i.quantity, price: i.price }))),
    ], cost).costo;
    const utilidadNeta = ingresos - costo - egresos;
    const margenNeto = ingresos > 0 ? (utilidadNeta / ingresos) * 100 : 0;
    const ticketsTotal = pOrders.length + pSales.length;

    // Deltas
    const prevIngresos = prevOrders.reduce((a, o) => a + o.total, 0) + prevSales.reduce((a, s) => a + s.total, 0);
    const prevEgresos = prevPurchases.reduce((a, p) => a + p.total, 0);
    const prevBalance = prevIngresos - prevEgresos;
    const pctD = (c: number, p: number) => p === 0 ? null : ((c - p) / p) * 100;
    const dIngresos = pctD(ingresos, prevIngresos);
    const dEgresos = pctD(egresos, prevEgresos);
    const dBalance = pctD(balance, prevBalance);

    // Daily cash flow
    const dayIncome = new Map<string, number>();
    const dayExpense = new Map<string, number>();
    pOrders.forEach(o => { const k = dateKey(new Date(o.createdAt)); dayIncome.set(k, (dayIncome.get(k) ?? 0) + o.total); });
    pSales.forEach(s => { const k = dateKey(new Date(s.createdAt)); dayIncome.set(k, (dayIncome.get(k) ?? 0) + s.total); });
    pPurchases.forEach(p => { if (!p.createdAt) return; const k = dateKey(new Date(p.createdAt)); dayExpense.set(k, (dayExpense.get(k) ?? 0) + p.total); });
    const allDays = [...new Set([...dayIncome.keys(), ...dayExpense.keys()])].sort().slice(-14);
    const flujoDiario = allDays.map(k => {
      const inc = dayIncome.get(k) ?? 0;
      const exp = dayExpense.get(k) ?? 0;
      return { dia: dayLabel(k), ingresos: inc, egresos: exp, balance: inc - exp };
    });

    // Payment methods
    const payMap = new Map<string, number>();
    pOrders.forEach(o => { const m = o.paymentMethod ?? "efectivo"; payMap.set(m, (payMap.get(m) ?? 0) + o.total); });
    pSales.forEach(s => { const m = s.payment ?? "efectivo"; payMap.set(m, (payMap.get(m) ?? 0) + s.total); });
    const payTotal = [...payMap.values()].reduce((a, b) => a + b, 0);
    const metodosPago = [...payMap.entries()].map(([m, t]) => ({
      metodo: PAY_LABELS[m] ?? m, monto: t,
      porcentaje: payTotal > 0 ? (t / payTotal) * 100 : 0,
      color: PAY_COLORS[m] ?? "#94a3b8",
    })).sort((a, b) => b.monto - a.monto);

    // Monthly trend (6 months)
    const flujoMensual: CajaData["flujoMensual"] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
      const mInc = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd).reduce((a, o) => a + o.total, 0)
        + sales.filter(s => new Date(s.createdAt) >= mStart && new Date(s.createdAt) <= mEnd).reduce((a, s) => a + s.total, 0);
      const mExp = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= mStart && new Date(p.createdAt) <= mEnd).reduce((a, p) => a + p.total, 0);
      flujoMensual.push({ mes: label, ingresos: mInc, egresos: mExp });
    }

    // Waterfall
    const waterfall: CajaData["waterfall"] = [
      { concepto: "Ventas (pedidos)", monto: pOrders.reduce((a, o) => a + o.total, 0), tipo: "ingreso", color: "var(--accent)" },
      { concepto: "Ventas (POS)", monto: pSales.reduce((a, s) => a + s.total, 0), tipo: "ingreso", color: "#06b6d4" },
      { concepto: "Costo de productos", monto: -costo, tipo: "egreso", color: "#f59e0b" },
      { concepto: "Compras", monto: -egresos, tipo: "egreso", color: "#ef4444" },
      { concepto: "Balance Neto", monto: utilidadNeta, tipo: "balance", color: utilidadNeta >= 0 ? "var(--accent)" : "#ef4444" },
    ];

    // 7-day forecast
    const recentIncome = flujoDiario.slice(-7).map(d => d.ingresos);
    const recentExpense = flujoDiario.slice(-7).map(d => d.egresos);
    const avgIncome = recentIncome.length > 0 ? recentIncome.reduce((a, b) => a + b, 0) / recentIncome.length : 0;
    const avgExpense = recentExpense.length > 0 ? recentExpense.reduce((a, b) => a + b, 0) / recentExpense.length : 0;
    const forecast7 = Array.from({ length: 7 }, (_, i) => {
      const fd = new Date(now); fd.setDate(fd.getDate() + i + 1);
      return { dia: dayLabel(dateKey(fd)), ingreso: Math.round(avgIncome * 100) / 100, egreso: Math.round(avgExpense * 100) / 100 };
    });

    // Income by hour (today)
    const todayStr = now.toDateString();
    const hourMap = new Map<number, number>();
    orders.filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status === "entregado").forEach(o => {
      const h = new Date(o.createdAt).getHours();
      hourMap.set(h, (hourMap.get(h) ?? 0) + o.total);
    });
    sales.filter(s => new Date(s.createdAt).toDateString() === todayStr).forEach(s => {
      const h = new Date(s.createdAt).getHours();
      hourMap.set(h, (hourMap.get(h) ?? 0) + s.total);
    });
    const ingresosPorHora = Array.from({ length: 14 }, (_, i) => i + 7).map(h => ({
      hora: `${h}:00`, monto: hourMap.get(h) ?? 0,
    }));

    return {
      ingresos, egresos, balance, utilidadNeta, margenNeto, ticketsTotal,
      dIngresos, dEgresos, dBalance,
      flujoDiario, metodosPago, flujoMensual, waterfall, forecast7, ingresosPorHora,
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

  if (data.ingresos === 0 && data.egresos === 0 && data.ticketsTotal === 0) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="movimientos de caja"
        onChangeRange={onChangeRange}
        action={{ label: "Abrir caja", href: "/admin?tab=turnos" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 2026-04-24: DashboardSectionHeader removido por decision UX —
          los KPI tiles + charts comunican el contenido sin necesidad del
          eyebrow + titulo + subtitulo descriptivos arriba. */}

      {/* ── KPI Hero Row · ADR-068 armonía estricta — con sparklines ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ingresos" value={fmt(data.ingresos)} icon={ArrowUpFromLine} delta={data.dIngresos} sparkline={data.flujoDiario.length >= 2 ? { data: data.flujoDiario.map(d => d.ingresos) } : undefined} />
        <StatCard label="Egresos" value={fmt(data.egresos)} icon={ArrowDownToLine} delta={data.dEgresos} sparkline={data.flujoDiario.length >= 2 ? { data: data.flujoDiario.map(d => d.egresos) } : undefined} />
        <StatCard label="Balance" value={fmt(data.balance)} icon={Wallet} delta={data.dBalance} emphasis={data.balance >= 0 ? "neutral" : "error"} sparkline={data.flujoDiario.length >= 2 ? { data: data.flujoDiario.map(d => d.balance) } : undefined} />
        <StatCard label="Utilidad Neta" value={fmt(data.utilidadNeta)} icon={DollarSign} emphasis={data.utilidadNeta >= 0 ? "success" : "error"} />
        <StatCard label="Margen Neto" value={`${Number(data.margenNeto).toFixed(1)}%`} icon={Percent} emphasis={data.margenNeto >= 15 ? "success" : data.margenNeto >= 5 ? "warning" : "error"} />
        <StatCard label="Tickets" value={String(data.ticketsTotal)} icon={Banknote} />
      </div>

      {/* ── Balance summary bar ── */}
      <div className="flex items-center gap-3 bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-5 py-3">
        <Wallet className="h-4 w-4 text-[var(--text-tertiary)]" />
        <div className="flex-1 flex items-center gap-4 text-sm flex-wrap">
          <span className="text-[var(--text-secondary)] dark:text-muted">Ingresos:</span>
          <span className="font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{fmt(data.ingresos)}</span>
          <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">−</span>
          <span className="text-[var(--text-secondary)] dark:text-muted">Egresos:</span>
          <span className="font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{fmt(data.egresos)}</span>
          <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">=</span>
          <span className="text-[var(--text-secondary)] dark:text-muted">Balance:</span>
          <span className={cn("font-bold", data.balance >= 0 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>{fmt(data.balance)}</span>
        </div>
      </div>

      {/* ── Charts base (flujo 14d, tendencia mensual, por hora, método, ratio, waterfall) ── */}
      <CajaCharts data={data} />

      {/* ── Charts especializados (runway, pareto pagos, evolución métodos, comparativa, margen trend, balance acumulado) ── */}
      <CajaAdvancedCharts />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-28" />)}
      </div>
      <div className="bg-[var(--surface-sunken)] rounded-xl h-12" />
      <div className="bg-[var(--surface-sunken)] rounded-xl h-[380px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[300px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[300px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-[260px]" />)}
      </div>
    </div>
  );
}
