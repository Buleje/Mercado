"use client";

import { useMemo } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { buildCostLookup, aggregateMargin } from "@/lib/chart-helpers";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { describeRange, type DateRange } from "./DashboardDateRange";
import { algunDato } from "@/lib/admin/inicio/hay-datos";
import { fechaCorta, MESES_CORTOS } from "@/lib/admin/inicio/formato-tablero";

import { BulejeDashboardSkeleton } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";
import CajaResumen from "./CajaResumen";
import { COLOR_METODO, COLOR_METODO_OTRO, PAY_LABELS, type CajaData } from "./caja-presentacion";

const CajaCharts = dynamic(() => import("./CajaCharts"), { ssr: false });
const CajaAdvancedCharts = dynamic(
  () => import("./CajaAdvancedCharts").then((m) => ({ default: m.CajaAdvancedCharts })),
  { ssr: false },
);

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
/** «09 oct» con meses escritos a mano (el `formatDateShort` de ICU dejaba «09 oct.»). */
const dayLabel = (dk: string) => fechaCorta(dk);
/** «may 2026» (ICU daba «may. 2026»). */
const mesLabel = (d: Date) => `${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;

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
      return { dia: dayLabel(k), fecha: k, ingresos: inc, egresos: exp, balance: inc - exp };
    });

    // Payment methods
    const payMap = new Map<string, number>();
    pOrders.forEach(o => { const m = o.paymentMethod ?? "efectivo"; payMap.set(m, (payMap.get(m) ?? 0) + o.total); });
    pSales.forEach(s => { const m = s.payment ?? "efectivo"; payMap.set(m, (payMap.get(m) ?? 0) + s.total); });
    const payTotal = [...payMap.values()].reduce((a, b) => a + b, 0);
    const metodosPago = [...payMap.entries()].map(([m, t]) => ({
      metodo: PAY_LABELS[m] ?? m, monto: t,
      porcentaje: payTotal > 0 ? (t / payTotal) * 100 : 0,
      color: COLOR_METODO[m] ?? COLOR_METODO_OTRO,
    })).sort((a, b) => b.monto - a.monto);

    // Monthly trend (6 months)
    const flujoMensual: CajaData["flujoMensual"] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = mesLabel(mStart);
      const mInc = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd).reduce((a, o) => a + o.total, 0)
        + sales.filter(s => new Date(s.createdAt) >= mStart && new Date(s.createdAt) <= mEnd).reduce((a, s) => a + s.total, 0);
      const mExp = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= mStart && new Date(p.createdAt) <= mEnd).reduce((a, p) => a + p.total, 0);
      flujoMensual.push({ mes: label, ingresos: mInc, egresos: mExp });
    }

    // Waterfall
    const waterfall: CajaData["waterfall"] = [
      { concepto: "Pedidos", monto: pOrders.reduce((a, o) => a + o.total, 0), tipo: "ingreso", color: "var(--data-5)" },
      { concepto: "Mostrador", monto: pSales.reduce((a, s) => a + s.total, 0), tipo: "ingreso", color: "var(--data-5)" },
      { concepto: "Costo", monto: -costo, tipo: "egreso", color: "var(--data-7)" },
      { concepto: "Compras", monto: -egresos, tipo: "egreso", color: "var(--data-7)" },
      { concepto: "Te queda", monto: utilidadNeta, tipo: "balance", color: "var(--data-1)" },
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
      <button onClick={() => void refresh()} className="px-4 min-h-10 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  // R1: sin ningún movimiento en el rango → sólo el estado vacío (sin muro de «S/ 0.00»).
  if (!algunDato([data.ingresos, data.egresos, data.ticketsTotal])) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="movimientos de caja"
        onChangeRange={onChangeRange}
        action={{ label: "Abrir la caja", href: "/admin?tab=turnos" }}
      />
    );
  }

  const periodo = describeRange(dateRange);
  return (
    <div className="space-y-4">
      <CajaResumen data={data} periodo={periodo} />
      <CajaCharts data={data} periodo={periodo} />
      <CajaAdvancedCharts />
    </div>
  );
}
