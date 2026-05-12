"use client";

import { useState, useMemo } from "react";
import { PageTitle } from "@buleje/design-system";
import {
  DollarSign, ShoppingCart, Package, TrendingUp, TrendingDown,
  Minus, AlertTriangle, Truck, RefreshCw,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";
import { MultiMetricCard } from "@/components/admin/shared/MultiMetricCard";
import { DraggableWidgetGrid } from "@/components/admin/shared/DraggableWidgetGrid";

// Lazy load recharts for bundle optimization
const RechartsCharts = dynamic(() => import("./InicioCharts"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: number; name: string; price: number; quantity: number; unit: string; image: string;
}
interface Order {
  id: string;
  customer: { name: string; phone?: string; location: string; reference: string };
  items: OrderItem[]; total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo"; createdAt: string; updatedAt: string;
}
interface Sale {
  id: string; total: number; totalCogs: number;
  payment: string; amountPaid: number; change: number;
  customerPhone: string; cashierId: number; createdAt: string;
  comprobanteTipo?: string; comprobanteRuc?: string;
  descuentoMonto?: number; descuentoPorcentaje?: number;
  paymentDetails?: string;
  items: { productId: number; name: string; price: number; costPrice?: number; quantity: number; unit: string }[];
}
interface Product {
  id: number; name: string; category: string;
  price: number; costPrice?: number;
  image?: string; unit: string;
  stock?: number; stockMin?: number; stockMax?: number;
  active: boolean;
}
interface Customer {
  phone: string; name: string; totalSpent: number;
  creditBalance: number; creditLimit: number;
  loyaltyPoints?: number; loyaltyTier?: string;
  createdAt: string; updatedAt: string;
}
interface Purchase {
  id: string; supplierId: string; supplierName: string;
  total: number; status: string; createdAt?: string;
}
interface Payable {
  id: string; supplierId: string; supplierName: string;
  amount: number; paidAmount: number; status: string; dueDate: string;
}

// Computed dashboard data
export interface DashboardData {
  // KPIs
  ventasHoy: number;
  ventasAyer: number;
  utilidadHoy: number;
  margenHoy: number;
  ticketsHoy: number;
  ticketPromedio: number;
  pedidosPendientes: number;
  stockCritico: number;
  clientesActivos: number;
  deudaProveedores: number;
  // Trends
  deltaVentas: number | null;
  deltaUtilidad: number | null;
  deltaTickets: number | null;
  deltaClientes: number | null;
  // Charts
  ventasDiarias: { dia: string; ventas: number; utilidad: number }[];
  ventasPorCategoria: { nombre: string; total: number; color: string }[];
  ventasPorMetodoPago: { metodo: string; total: number; color: string }[];
  topProductos: { nombre: string; ingresos: number; unidades: number }[];
  stockAlerta: { nombre: string; stock: number; mínimo: number; diasRestantes: number }[];
  ventasPorHora: { hora: string; cantidad: number }[];
  clientesPorTier: { tier: string; cantidad: number; color: string }[];
  funnelPedidos: { etapa: string; cantidad: number; color: string }[];
  comprasPorProveedor: { proveedor: string; total: number }[];
  flujoEfectivo: { dia: string; ingresos: number; egresos: number }[];
  sparkVentas: number[];
  sparkUtilidad: number[];
  sparkTickets: number[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(dk: string) {
  return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit" });
}

const CAT_COLORS: Record<string, string> = {
  "frutas-verduras": "#10b981", abarrotes: "#f59e0b", carnes: "#ef4444",
  lacteos: "#3b82f6", bebidas: "#8b5cf6", limpieza: "#06b6d4",
  otros: "#94a3b8",
};
const CAT_LABELS: Record<string, string> = {
  "frutas-verduras": "Frutas", abarrotes: "Abarrotes", carnes: "Carnes",
  lacteos: "Lácteos", bebidas: "Bebidas", limpieza: "Limpieza",
};
const PAY_COLORS: Record<string, string> = {
  efectivo: "#10b981", yape: "#8b5cf6", plin: "#06b6d4",
  tarjeta: "#3b82f6", transferencia: "#f59e0b",
};
const TIER_COLORS: Record<string, string> = {
  gold: "#f59e0b", silver: "#94a3b8", bronze: "#b45309", default: "#6b7280",
};

const PERIOD_LABELS: Record<string, string> = {
  diario: "hoy", semanal: "esta semana", mensual: "este mes", anual: "este año", personalizado: "del periodo",
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function InicioDashboard({ dateRange }: { dateRange: DateRange }) {
  const { data: raw, loading, error, lastUpdated, refresh: load } = useDashboardData();

  // Extract arrays from shared payload
  const products = (raw?.products ?? []) as Product[];
  const orders = (raw?.orders ?? []) as Order[];
  const sales = (raw?.sales ?? []) as Sale[];
  const customers = (raw?.customers ?? []) as Customer[];
  const purchases = (raw?.purchases ?? []) as Purchase[];
  const payables = (raw?.payables ?? []) as Payable[];

  // ── Compute all dashboard metrics ──────────────────────────────────────

  const data: DashboardData = useMemo(() => {
    const costMap = new Map(products.map(p => [p.id, p.costPrice ?? p.price * 0.7]));

    // ── Period filtering based on dateRange ──
    const inRange = (iso: string) => { const d = new Date(iso); return d >= dateRange.from && d <= dateRange.to; };

    // Previous period (same duration, right before dateRange.from)
    const rangeDuration = dateRange.to.getTime() - dateRange.from.getTime();
    const prevFrom = new Date(dateRange.from.getTime() - rangeDuration);
    const prevTo = new Date(dateRange.from.getTime() - 1);
    const inPrev = (iso: string) => { const d = new Date(iso); return d >= prevFrom && d <= prevTo; };

    const periodOrders = orders.filter(o => o.status !== "cancelado" && inRange(o.createdAt));
    const periodSales = sales.filter(s => inRange(s.createdAt));
    const prevOrders = orders.filter(o => o.status !== "cancelado" && inPrev(o.createdAt));
    const prevSales = sales.filter(s => inPrev(s.createdAt));

    const ventasHoy = periodOrders.reduce((a, o) => a + o.total, 0) + periodSales.reduce((a, s) => a + s.total, 0);
    const ventasAyer = prevOrders.reduce((a, o) => a + o.total, 0) + prevSales.reduce((a, s) => a + s.total, 0);

    let costoHoy = 0;
    periodOrders.forEach(o => o.items.forEach(i => { costoHoy += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity; }));
    periodSales.forEach(s => s.items.forEach(i => { costoHoy += (costMap.get(i.productId) ?? i.price * 0.7) * i.quantity; }));
    const utilidadHoy = ventasHoy - costoHoy;
    const margenHoy = ventasHoy > 0 ? (utilidadHoy / ventasHoy) * 100 : 0;

    const ticketsHoy = periodOrders.length + periodSales.length;
    const ticketsAyer = prevOrders.length + prevSales.length;
    const ticketPromedio = ticketsHoy > 0 ? ventasHoy / ticketsHoy : 0;

    // Period comparisons
    const pctDelta = (curr: number, prev: number) => prev === 0 ? null : ((curr - prev) / prev) * 100;
    let costoAyer = 0;
    prevOrders.forEach(o => o.items.forEach(i => { costoAyer += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity; }));
    prevSales.forEach(s => s.items.forEach(i => { costoAyer += (costMap.get(i.productId) ?? i.price * 0.7) * i.quantity; }));
    const utilidadAyer = ventasAyer - costoAyer;

    // Unique clients this period vs previous
    const clientsToday = new Set<string>();
    periodOrders.forEach(o => { if (o.customer.phone) clientsToday.add(o.customer.phone); });
    periodSales.forEach(s => { if (s.customerPhone) clientsToday.add(s.customerPhone); });
    const clientsYest = new Set<string>();
    prevOrders.forEach(o => { if (o.customer.phone) clientsYest.add(o.customer.phone); });
    prevSales.forEach(s => { if (s.customerPhone) clientsYest.add(s.customerPhone); });

    const pedidosPendientes = orders.filter(o => o.status === "pendiente").length;
    const stockCritico = products.filter(p => p.active && p.stock != null && p.stockMin != null && p.stock <= p.stockMin).length;
    const clientesActivos = customers.length;

    const pendingPayables = payables.filter(p => p.status !== "pagado");
    const deudaProveedores = pendingPayables.reduce((a, p) => a + (p.amount - p.paidAmount), 0);

    // ── Daily sales chart ──
    const dailyMap = new Map<string, { ventas: number; costo: number }>();
    [...periodOrders.map(o => ({ date: o.createdAt, total: o.total, items: o.items, type: "order" as const })),
     ...periodSales.map(s => ({ date: s.createdAt, total: s.total, items: s.items.map(i => ({ id: i.productId, price: i.price, quantity: i.quantity })), type: "sale" as const }))
    ].forEach(x => {
      const k = dateKey(x.date);
      const entry = dailyMap.get(k) ?? { ventas: 0, costo: 0 };
      entry.ventas += x.total;
      x.items.forEach(i => { entry.costo += (costMap.get(i.id) ?? i.price * 0.7) * i.quantity; });
      dailyMap.set(k, entry);
    });
    const ventasDiarias = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([dk, v]) => ({ dia: dayLabel(dk), ventas: v.ventas, utilidad: v.ventas - v.costo }));

    // ── Category breakdown ──
    const catMap = new Map<string, number>();
    periodOrders.forEach(o => {
      o.items.forEach(i => {
        const cat = products.find(p => p.id === i.id)?.category ?? "otros";
        catMap.set(cat, (catMap.get(cat) ?? 0) + i.price * i.quantity);
      });
    });
    periodSales.forEach(s => {
      s.items.forEach(i => {
        const cat = products.find(p => p.id === i.productId)?.category ?? "otros";
        catMap.set(cat, (catMap.get(cat) ?? 0) + i.price * i.quantity);
      });
    });
    const ventasPorCategoria = [...catMap.entries()]
      .map(([cat, total]) => ({ nombre: CAT_LABELS[cat] ?? cat, total, color: CAT_COLORS[cat] ?? "#94a3b8" }))
      .sort((a, b) => b.total - a.total);

    // ── Payment methods ──
    const payMap = new Map<string, number>();
    periodOrders.forEach(o => payMap.set(o.paymentMethod ?? "efectivo", (payMap.get(o.paymentMethod ?? "efectivo") ?? 0) + o.total));
    periodSales.forEach(s => payMap.set(s.payment ?? "efectivo", (payMap.get(s.payment ?? "efectivo") ?? 0) + s.total));
    const ventasPorMetodoPago = [...payMap.entries()]
      .map(([m, total]) => ({ metodo: m.charAt(0).toUpperCase() + m.slice(1), total, color: PAY_COLORS[m] ?? "#94a3b8" }))
      .sort((a, b) => b.total - a.total);

    // ── Top products ──
    const prodMap = new Map<number, { nombre: string; ingresos: number; unidades: number }>();
    periodOrders.forEach(o => o.items.forEach(i => {
      const e = prodMap.get(i.id) ?? { nombre: i.name, ingresos: 0, unidades: 0 };
      e.ingresos += i.price * i.quantity; e.unidades += i.quantity;
      prodMap.set(i.id, e);
    }));
    periodSales.forEach(s => s.items.forEach(i => {
      const e = prodMap.get(i.productId) ?? { nombre: i.name, ingresos: 0, unidades: 0 };
      e.ingresos += i.price * i.quantity; e.unidades += i.quantity;
      prodMap.set(i.productId, e);
    }));
    const topProductos = [...prodMap.values()].sort((a, b) => b.ingresos - a.ingresos).slice(0, 8);

    // ── Stock alerts (days remaining projection) ──
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const recentOrders = orders.filter(o => new Date(o.createdAt) >= d30 && o.status !== "cancelado");
    const recentSales = sales.filter(s => new Date(s.createdAt) >= d30);
    const sold30 = new Map<number, number>();
    recentOrders.forEach(o => o.items.forEach(i => sold30.set(i.id, (sold30.get(i.id) ?? 0) + i.quantity)));
    recentSales.forEach(s => s.items.forEach(i => sold30.set(i.productId, (sold30.get(i.productId) ?? 0) + i.quantity)));

    const stockAlerta = products
      .filter(p => p.active && p.stock != null && p.stock > 0 && p.stockMin != null)
      .map(p => {
        const dailyRate = (sold30.get(p.id) ?? 0) / 30;
        const diasRestantes = dailyRate > 0 ? Math.round(p.stock! / dailyRate) : 999;
        return { nombre: p.name, stock: p.stock!, mínimo: p.stockMin!, diasRestantes };
      })
      .filter(p => p.diasRestantes < 30)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 8);

    // ── Sales by hour (heatmap data) ──
    const hourMap = new Map<number, number>();
    periodOrders.forEach(o => { const h = new Date(o.createdAt).getHours(); hourMap.set(h, (hourMap.get(h) ?? 0) + 1); });
    periodSales.forEach(s => { const h = new Date(s.createdAt).getHours(); hourMap.set(h, (hourMap.get(h) ?? 0) + 1); });
    const ventasPorHora = Array.from({ length: 16 }, (_, i) => i + 6).map(h => ({
      hora: `${String(h).padStart(2, "0")}:00`, cantidad: hourMap.get(h) ?? 0,
    }));

    // ── Customer tiers ──
    const tierMap = new Map<string, number>();
    customers.forEach(c => {
      const tier = c.loyaltyTier || "default";
      tierMap.set(tier, (tierMap.get(tier) ?? 0) + 1);
    });
    const clientesPorTier = [...tierMap.entries()]
      .map(([tier, cantidad]) => ({ tier: tier.charAt(0).toUpperCase() + tier.slice(1), cantidad, color: TIER_COLORS[tier] ?? "#6b7280" }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // ── Order funnel ──
    const allOrders = orders.filter(o => inRange(o.createdAt));
    const funnelPedidos = [
      { etapa: "Recibidos", cantidad: allOrders.length, color: "#3b82f6" },
      { etapa: "Confirmados", cantidad: allOrders.filter(o => ["confirmado", "en_camino", "entregado"].includes(o.status)).length, color: "#06b6d4" },
      { etapa: "En camino", cantidad: allOrders.filter(o => ["en_camino", "entregado"].includes(o.status)).length, color: "#8b5cf6" },
      { etapa: "Entregados", cantidad: allOrders.filter(o => o.status === "entregado").length, color: "var(--accent)" },
    ];

    // ── Purchases by supplier ──
    const supMap = new Map<string, number>();
    purchases.filter(p => inRange(p.createdAt ?? "")).forEach(p => supMap.set(p.supplierName, (supMap.get(p.supplierName) ?? 0) + p.total));
    const comprasPorProveedor = [...supMap.entries()]
      .map(([proveedor, total]) => ({ proveedor, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // ── Cash flow (last 14 days: ingresos vs egresos) ──
    const egresoMap = new Map<string, number>();
    purchases.forEach(p => { if (p.createdAt) { const k = dateKey(p.createdAt); egresoMap.set(k, (egresoMap.get(k) ?? 0) + p.total); } });
    const flujoEfectivo = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([dk, v]) => ({ dia: dayLabel(dk), ingresos: v.ventas, egresos: egresoMap.get(dk) ?? 0 }));

    // ── Sparklines (last 7 days) ──
    const last7 = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7);
    const sparkVentas = last7.map(([, v]) => v.ventas);
    const sparkUtilidad = last7.map(([, v]) => v.ventas - v.costo);
    const sparkTickets: number[] = [];
    const dailyTicketMap = new Map<string, number>();
    orders.filter(o => o.status !== "cancelado").forEach(o => { const k = dateKey(o.createdAt); dailyTicketMap.set(k, (dailyTicketMap.get(k) ?? 0) + 1); });
    sales.forEach(s => { const k = dateKey(s.createdAt); dailyTicketMap.set(k, (dailyTicketMap.get(k) ?? 0) + 1); });
    last7.forEach(([dk]) => sparkTickets.push(dailyTicketMap.get(dk) ?? 0));

    return {
      ventasHoy, ventasAyer, utilidadHoy, margenHoy, ticketsHoy, ticketPromedio,
      pedidosPendientes, stockCritico, clientesActivos, deudaProveedores,
      deltaVentas: pctDelta(ventasHoy, ventasAyer),
      deltaUtilidad: pctDelta(utilidadHoy, utilidadAyer),
      deltaTickets: pctDelta(ticketsHoy, ticketsAyer),
      deltaClientes: pctDelta(clientsToday.size, clientsYest.size),
      ventasDiarias, ventasPorCategoria, ventasPorMetodoPago, topProductos,
      stockAlerta, ventasPorHora, clientesPorTier, funnelPedidos,
      comprasPorProveedor, flujoEfectivo, sparkVentas, sparkUtilidad, sparkTickets,
    };
  }, [products, orders, sales, customers, purchases, payables, dateRange]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading && !lastUpdated) {
    return <DashboardSkeleton />;
  }

  if (error && !lastUpdated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
        <p className="text-sm font-medium text-[var(--text-secondary)]">{error}</p>
        <button onClick={() => void load()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition">
          <RefreshCw className="h-4 w-4 inline mr-2" />Reintentar
        </button>
      </div>
    );
  }

  const periodLabel = PERIOD_LABELS[dateRange.preset] ?? "del periodo";

  // Greeting contextual — franja horaria del día para personalizar.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buen día" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  // Derivar series para DashboardOverviewCharts desde data calculado.
  // Mapea InicioDashboard.data → DashboardOverviewChartsProps.st
  const hourMap = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const d = new Date(o.createdAt);
    hourMap.set(`${d.getDay()}-${d.getHours()}`, (hourMap.get(`${d.getDay()}-${d.getHours()}`) ?? 0) + 1);
  }
  for (const s of sales) {
    const d = new Date(s.createdAt);
    hourMap.set(`${d.getDay()}-${d.getHours()}`, (hourMap.get(`${d.getDay()}-${d.getHours()}`) ?? 0) + 1);
  }
  const maxHeat = Math.max(1, ...Array.from(hourMap.values()));

  // Top customers (revenue acumulado periodo)
  const custRevMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const name = o.customer?.name ?? "Anonimo";
    const cur = custRevMap.get(name) ?? { revenue: 0, orders: 0 };
    cur.revenue += o.total ?? 0;
    cur.orders += 1;
    custRevMap.set(name, cur);
  }
  const topCustomers = Array.from(custRevMap.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(([name, v]) => ({ name, ...v }));

  // Stock por categoria (treemap)
  const stockCatMap = new Map<string, { value: number; items: number }>();
  for (const p of products) {
    if (!p.active) continue;
    const cat = p.category ?? "Sin categoria";
    const value = (p.stock ?? 0) * (p.costPrice ?? p.price * 0.7);
    if (value <= 0) continue;
    const cur = stockCatMap.get(cat) ?? { value: 0, items: 0 };
    cur.value += value;
    cur.items += 1;
    stockCatMap.set(cat, cur);
  }
  const stockByCategory = Array.from(stockCatMap.entries())
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([category, v]) => ({ category, ...v }));

  // Productos sin movimiento (deadstock)
  const soldIds = new Set<number | string>();
  orders.forEach(o => o.items.forEach(i => soldIds.add(i.id)));
  sales.forEach(s => s.items.forEach(i => soldIds.add(i.productId)));
  const sinMov = products
    .filter(p => p.active && !soldIds.has(p.id))
    .map(p => ({ id: p.id, name: p.name, stock: p.stock ?? 0, price: p.price, costPrice: p.costPrice, category: p.category }));

  // Stock critico con projection
  // eslint-disable-next-line react-hooks/purity -- Date.now() es intencional para ventana de 30 días
  const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const productSales30 = new Map<number | string, number>();
  orders
    .filter(o => o.status !== "cancelado" && new Date(o.createdAt).getTime() >= last30)
    .forEach(o => o.items.forEach(i => productSales30.set(i.id, (productSales30.get(i.id) ?? 0) + i.quantity)));
  sales
    .filter(s => new Date(s.createdAt).getTime() >= last30)
    .forEach(s => s.items.forEach(i => productSales30.set(i.productId, (productSales30.get(i.productId) ?? 0) + i.quantity)));
  const criticalStock = products
    .filter(p => p.active && p.stock != null && p.stock > 0)
    .map(p => {
      const sold30 = productSales30.get(p.id) ?? 0;
      const dailyRate = sold30 / 30;
      const daysRemaining = dailyRate > 0 ? Math.round((p.stock ?? 0) / dailyRate) : 999;
      return {
        id: p.id,
        name: p.name,
        stock: p.stock,
        stockMin: p.stockMin ?? null,
        daysRemaining,
        dailyRate: Math.round(dailyRate * 10) / 10,
        suggestedOrderQty: dailyRate > 0 ? Math.ceil(dailyRate * 30) : (p.stockMin ?? 10),
      };
    })
    .filter(p => p.daysRemaining < 7)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Top profit (BCG matrix) — derivar de topProductos
  // Shape real: { nombre, ingresos, unidades }
  const topProfit = data.topProductos.map((p, idx) => ({
    id: idx,
    name: p.nombre,
    revenue: p.ingresos,
    profit: p.ingresos * 0.3, // estimacion proxy 30% margen
    units: p.unidades,
    cost: p.ingresos * 0.7,
  }));

  return (
    <div className="space-y-6">
      {/* ── DASHBOARD OVERVIEW CHARTS PRO — 12 secciones de alto nivel ──
          KPIs con deltas, sparklines, heatmap hora x dia, BCG matrix, deadstock,
          stock critico, cohort retention, cash runway, conversion funnel. */}
      {null /* legacy — migrar a DashboardTab */}

      {/* ── Editorial Header — presencia tipográfica + contexto ── */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4 border-b border-[var(--rule-soft)]">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
            Panel de control · {periodLabel}
          </p>
          <PageTitle className="font-display tracking-[var(--ls-tight)] leading-[1.05]">
            {greeting}, <span className="text-[var(--accent)]">tu bodega</span>
          </PageTitle>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {lastUpdated
              ? `Última actualización: ${new Date(lastUpdated).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`
              : "Cargando datos en tiempo real…"}
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 self-start sm:self-end px-3 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--rule-strong)] transition-colors"
          aria-label="Actualizar datos"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </header>

      {/* ── KPI Hero Row — drag & drop para reordenar ──
          El dueño puede arrastrar los widgets para priorizar los que le
          importan. El orden se persiste en localStorage por usuario. */}
      <DraggableWidgetGrid storageKey="inicio-kpi-order" columns={3}>
        <div key="ventas">
          <MultiMetricCard
            eyebrow={`Ventas ${periodLabel}`}
            title="Ingresos"
            value={fmtSoles(data.ventasHoy)}
            delta={data.deltaVentas != null ? { value: data.deltaVentas, label: "vs anterior" } : undefined}
            spark={data.sparkVentas}
            secondary={[
              { icon: TrendingUp, label: "Utilidad", value: fmtSoles(data.utilidadHoy) },
              { icon: ShoppingCart, label: "Tickets", value: String(data.ticketsHoy) },
            ]}
          />
        </div>
        <div key="tickets">
          <MultiMetricCard
            eyebrow={`Tickets ${periodLabel}`}
            title="Movimiento"
            value={String(data.ticketsHoy)}
            caption={`Promedio ${fmtSoles(data.ticketPromedio)}`}
            delta={data.deltaTickets != null ? { value: data.deltaTickets, label: "vs anterior" } : undefined}
            spark={data.sparkTickets}
            secondary={[
              { icon: DollarSign, label: "Prom.", value: fmtSoles(data.ticketPromedio) },
              { icon: TrendingUp, label: "Margen", value: `${Number(data.margenHoy).toFixed(0)}%` },
            ]}
          />
        </div>
        <div key="operacion">
          <MultiMetricCard
            eyebrow="Operación · ahora"
            title="Qué atender hoy"
            value={String(data.pedidosPendientes)}
            caption={`${data.pedidosPendientes === 1 ? "Pedido pendiente" : "Pedidos pendientes"}`}
            badge={{
              label: data.pedidosPendientes === 0 ? "Al día" : data.pedidosPendientes <= 3 ? "Atender" : "Urgente",
              intent: data.pedidosPendientes === 0 ? "success" : data.pedidosPendientes <= 3 ? "warning" : "error",
            }}
            secondary={[
              { icon: AlertTriangle, label: "Stock crítico", value: String(data.stockCritico) },
              { icon: Truck, label: "Deuda prov.", value: fmtSoles(data.deudaProveedores) },
            ]}
          />
        </div>
      </DraggableWidgetGrid>

      {/* ── Margen bar — card editorial ── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 noise-texture-bg">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Margen bruto {periodLabel}
            </p>
            <p className={cn(
              "font-display text-3xl sm:text-4xl font-semibold tabular-nums leading-none mt-1",
              data.margenHoy >= 30 ? "text-[var(--data-success-500)]" : data.margenHoy >= 15 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"
            )}>
              {Number(data.margenHoy).toFixed(1)}%
            </p>
          </div>
          <span className={cn(
            "text-[length:var(--ts-2xs)] font-bold px-2.5 py-1 rounded-full",
            data.margenHoy >= 30 ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : data.margenHoy >= 15 ? "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]" : "bg-[var(--data-error-50)] text-[var(--data-error-500)]"
          )}>
            {data.margenHoy >= 30 ? "Excelente" : data.margenHoy >= 15 ? "Aceptable" : "Revisar"}
          </span>
        </div>
        <div className="h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-[var(--dur-slower)]",
              data.margenHoy >= 30 ? "bg-[var(--accent-soft)]" : data.margenHoy >= 15 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"
            )}
            style={{ width: `${Math.min(data.margenHoy, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <span>0%</span>
          <span>Objetivo: 30%</span>
          <span>100%</span>
        </div>
      </div>

      {/* ── Charts ── */}
      <RechartsCharts data={data} />
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

const COLOR_MAP = {
  blue: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: "text-[var(--data-success-500)]", badge: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  emerald: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: "text-[var(--data-success-500)]", badge: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  violet: { bg: "bg-[var(--surface-sunken)]", icon: "text-[var(--text-secondary)]", badge: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
  amber: { bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/20", icon: "text-[var(--data-warning-500)]", badge: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" },
  red: { bg: "bg-[var(--data-error-50)] dark:bg-red-950/20", icon: "text-[var(--data-error-500)]", badge: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]" },
} as const;

function KPICard({
  label, value, delta, icon: Icon, color, spark, subtitle, badge,
}: {
  label: string;
  value: string;
  delta?: number | null;
  icon: typeof DollarSign;
  color: keyof typeof COLOR_MAP;
  spark?: number[];
  subtitle?: string;
  badge?: string;
}) {
  const c = COLOR_MAP[color];
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-4  flex flex-col gap-2 relative overflow-hidden group hover:shadow-sm transition-shadow">
      {/* Sparkline background (decorative) */}
      {spark && spark.length > 1 && (
        <svg className="absolute bottom-0 left-0 right-0 h-10 opacity-10 pointer-events-none" viewBox={`0 0 ${spark.length - 1} 1`} preserveAspectRatio="none" aria-hidden="true">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="0.05"
            className={c.icon}
            points={spark.map((v, i) => {
              const max = Math.max(...spark, 1);
              return `${i / (spark.length - 1) * (spark.length - 1)},${1 - v / max}`;
            }).join(" ")}
          />
        </svg>
      )}

      <div className="flex items-center justify-between">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", c.bg)}>
          <Icon className={cn("h-4 w-4", c.icon)} />
        </div>
        {delta != null && (
          <DeltaBadge value={delta} />
        )}
        {badge && (
          <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", c.badge)}>{badge}</span>
        )}
      </div>

      <p className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-none tracking-[var(--ls-tight)] tabular-nums">
        {value}
      </p>
      <p className="text-[length:var(--ts-xs)] font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)] dark:text-muted leading-tight">
        {label}
      </p>
      {subtitle && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">{subtitle}</p>
      )}
    </div>
  );
}

function DeltaBadge({ value }: { value: number }) {
  const Icon = value === 0 ? Minus : value > 0 ? TrendingUp : TrendingDown;
  const color = value === 0
    ? "text-[var(--text-secondary)] bg-[var(--surface-sunken)]"
    : value > 0
      ? "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
      : "text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]";

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full", color)}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-72" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-64" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-64" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-64" />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSoles(n: number): string {
  if (n >= 1000) return `S/ ${(n / 1000).toFixed(1)}k`;
  return `S/ ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
