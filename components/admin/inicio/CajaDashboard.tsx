"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo } from "react";
import {
  Banknote, DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CreditCard, Percent, ArrowDownToLine, ArrowUpFromLine, Wallet,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const CajaCharts = dynamic(() => import("./CajaCharts"), { ssr: false });

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

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
const PAY_COLORS: Record<string, string> = { efectivo: "#10b981", yape: "#8b5cf6", plin: "#06b6d4", tarjeta: "#3b82f6", transferencia: "#f59e0b" };
const PAY_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia" };

// ── Main Component ───────────────────────────────────────────────────────────

interface CajaDashboardProps {
  dateRange: DateRange;
}

export default function CajaDashboard({ dateRange }: CajaDashboardProps) {
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

    const costMap = new Map(products.map(p => [p.id, p.costPrice ?? p.price * 0.7]));

    // Filter by date
    const pOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= from && new Date(o.createdAt) <= to);
    const pSales = sales.filter(s => new Date(s.createdAt) >= from && new Date(s.createdAt) <= to);
    const pPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= from && new Date(p.createdAt) <= to);

    // Previous period
    const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
    const prevTo = new Date(from.getTime() - 1);
    const prevOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= prevFrom && new Date(o.createdAt) <= prevTo);
    const prevSales = sales.filter(s => new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);
    const prevPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= prevFrom && new Date(p.createdAt) <= prevTo);

    // KPIs
    const ingresos = pOrders.reduce((a, o) => a + o.total, 0) + pSales.reduce((a, s) => a + s.total, 0);
    const egresos = pPurchases.reduce((a, p) => a + p.total, 0);
    const balance = ingresos - egresos;
    let costo = 0;
    pOrders.forEach(o => o.items.forEach(i => { costo += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity; }));
    pSales.forEach(s => s.items.forEach(i => { costo += (costMap.get(i.productId) ?? i.price * 0.7) * i.quantity; }));
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
      const mInc = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd).reduce((a, o) => a + o.total, 0)
        + sales.filter(s => new Date(s.createdAt) >= mStart && new Date(s.createdAt) <= mEnd).reduce((a, s) => a + s.total, 0);
      const mExp = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= mStart && new Date(p.createdAt) <= mEnd).reduce((a, p) => a + p.total, 0);
      flujoMensual.push({ mes: label, ingresos: mInc, egresos: mExp });
    }

    // Waterfall
    const waterfall: CajaData["waterfall"] = [
      { concepto: "Ventas (pedidos)", monto: pOrders.reduce((a, o) => a + o.total, 0), tipo: "ingreso", color: "#00B4A6" },
      { concepto: "Ventas (POS)", monto: pSales.reduce((a, s) => a + s.total, 0), tipo: "ingreso", color: "#06b6d4" },
      { concepto: "Costo de productos", monto: -costo, tipo: "egreso", color: "#f59e0b" },
      { concepto: "Compras", monto: -egresos, tipo: "egreso", color: "#ef4444" },
      { concepto: "Balance Neto", monto: utilidadNeta, tipo: "balance", color: utilidadNeta >= 0 ? "#00B4A6" : "#ef4444" },
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
    orders.filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status !== "cancelado").forEach(o => {
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

  if (loading) return <DashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning)]" />
      <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* ── KPI Hero Row · ADR-068 armonía estricta ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ingresos" value={fmt(data.ingresos)} icon={ArrowUpFromLine} delta={data.dIngresos} />
        <StatCard label="Egresos" value={fmt(data.egresos)} icon={ArrowDownToLine} delta={data.dEgresos} />
        <StatCard label="Balance" value={fmt(data.balance)} icon={Wallet} delta={data.dBalance} emphasis={data.balance >= 0 ? "neutral" : "error"} />
        <StatCard label="Utilidad Neta" value={fmt(data.utilidadNeta)} icon={DollarSign} emphasis={data.utilidadNeta >= 0 ? "success" : "error"} />
        <StatCard label="Margen Neto" value={`${data.margenNeto.toFixed(1)}%`} icon={Percent} emphasis={data.margenNeto >= 15 ? "success" : data.margenNeto >= 5 ? "warning" : "error"} />
        <StatCard label="Tickets" value={String(data.ticketsTotal)} icon={Banknote} />
      </div>

      {/* ── Balance summary bar ── */}
      <div className="flex items-center gap-3 bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl px-5 py-3">
        <Wallet className="h-4 w-4 text-[var(--text-tertiary)]" />
        <div className="flex-1 flex items-center gap-4 text-sm flex-wrap">
          <span className="text-[var(--text-secondary)] dark:text-muted">Ingresos:</span>
          <span className="font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">{fmt(data.ingresos)}</span>
          <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">−</span>
          <span className="text-[var(--text-secondary)] dark:text-muted">Egresos:</span>
          <span className="font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">{fmt(data.egresos)}</span>
          <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">=</span>
          <span className="text-[var(--text-secondary)] dark:text-muted">Balance:</span>
          <span className={cn("font-bold", data.balance >= 0 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : "text-[var(--data-error)] dark:text-[var(--data-error)]")}>{fmt(data.balance)}</span>
        </div>
      </div>

      {/* ── Charts ── */}
      <CajaCharts data={data} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, Icon, delta, accent, invertTrend }: {
  label: string; value: string;
  Icon: React.ComponentType<{ className?: string }>;
  delta?: number | null;
  accent: "emerald" | "blue" | "violet" | "cyan" | "amber" | "red";
  invertTrend?: boolean;
}) {
  const isPositive = delta != null ? (invertTrend ? delta <= 0 : delta >= 0) : false;
  const colorMap = {
    emerald: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: "text-[var(--data-success)]" },
    blue: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: "text-[var(--data-success)]" },
    violet: { bg: "bg-[var(--surface-sunken)]", icon: "text-[var(--text-secondary)]" },
    cyan: { bg: "bg-[var(--data-info-50)] dark:bg-cyan-950/30", icon: "text-cyan-500" },
    amber: { bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30", icon: "text-amber-500" },
    red: { bg: "bg-[var(--data-error-50)] dark:bg-red-950/30", icon: "text-red-500" },
  };
  const c = colorMap[accent];

  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", c.bg)}>
          <Icon className={cn("h-4.5 w-4.5", c.icon)} />
        </div>
        {delta != null && (
          <div className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold",
            isPositive ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" : "bg-[var(--data-error-50)] text-[var(--data-error)] dark:bg-red-950/30 dark:text-[var(--data-error)]"
          )}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-xl font-bold text-[var(--text-primary)] dark:text-foreground tabular-nums leading-none mb-1">{value}</p>
      <p className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)] dark:text-muted">{label}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-28 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-64 animate-pulse" />)}
      </div>
    </div>
  );
}
