"use client";

import { useState, useMemo } from "react";
import {
  DollarSign, ShoppingCart, Package, TrendingUp, TrendingDown,
  Minus, AlertTriangle, Truck, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

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
  stockAlerta: { nombre: string; stock: number; minimo: number; diasRestantes: number }[];
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
        return { nombre: p.name, stock: p.stock!, minimo: p.stockMin!, diasRestantes };
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
      { etapa: "Entregados", cantidad: allOrders.filter(o => o.status === "entregado").length, color: "#10b981" },
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
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{error}</p>
        <button onClick={() => void load()} className="px-4 py-2 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition">
          <RefreshCw className="h-4 w-4 inline mr-2" />Reintentar
        </button>
      </div>
    );
  }

  const periodLabel = PERIOD_LABELS[dateRange.preset] ?? "del periodo";

  return (
    <div className="space-y-5">
      {/* ── KPI Hero Row (6 big cards) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard
          label={`Ventas ${periodLabel}`}
          value={fmtSoles(data.ventasHoy)}
          delta={data.deltaVentas}
          icon={DollarSign}
          color="blue"
          spark={data.sparkVentas}
        />
        <KPICard
          label="Utilidad"
          value={fmtSoles(data.utilidadHoy)}
          delta={data.deltaUtilidad}
          icon={TrendingUp}
          color="emerald"
          spark={data.sparkUtilidad}
        />
        <KPICard
          label="Tickets"
          value={String(data.ticketsHoy)}
          delta={data.deltaTickets}
          icon={ShoppingCart}
          color="violet"
          spark={data.sparkTickets}
          subtitle={`Prom. ${fmtSoles(data.ticketPromedio)}`}
        />
        <KPICard
          label="Pedidos pendientes"
          value={String(data.pedidosPendientes)}
          icon={Package}
          color={data.pedidosPendientes > 3 ? "red" : data.pedidosPendientes > 0 ? "amber" : "emerald"}
          badge={data.pedidosPendientes === 0 ? "Al día" : data.pedidosPendientes <= 3 ? "Atender" : "Urgente"}
        />
        <KPICard
          label="Stock crítico"
          value={String(data.stockCritico)}
          icon={AlertTriangle}
          color={data.stockCritico > 5 ? "red" : data.stockCritico > 0 ? "amber" : "emerald"}
          badge={data.stockCritico === 0 ? "OK" : "Reponer"}
        />
        <KPICard
          label="Deuda proveedores"
          value={fmtSoles(data.deudaProveedores)}
          icon={Truck}
          color={data.deudaProveedores > 0 ? "amber" : "emerald"}
          subtitle={`${data.clientesActivos} clientes`}
        />
      </div>

      {/* ── Margen bar ── */}
      <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 dark:text-muted uppercase tracking-wide">Margen bruto {periodLabel}</span>
          <span className={cn(
            "text-sm font-extrabold",
            data.margenHoy >= 30 ? "text-emerald-600" : data.margenHoy >= 15 ? "text-amber-600" : "text-red-600"
          )}>
            {data.margenHoy.toFixed(1)}%
          </span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              data.margenHoy >= 30 ? "bg-emerald-500" : data.margenHoy >= 15 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${Math.min(data.margenHoy, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-400">
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
  blue: { bg: "bg-emerald-50 dark:bg-emerald-950/20", icon: "text-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/20", icon: "text-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  violet: { bg: "bg-violet-50 dark:bg-violet-950/20", icon: "text-violet-500", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/20", icon: "text-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  red: { bg: "bg-red-50 dark:bg-red-950/20", icon: "text-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
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
    <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl p-4 shadow-sm flex flex-col gap-2 relative overflow-hidden group hover:shadow-md transition-shadow">
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
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", c.badge)}>{badge}</span>
        )}
      </div>

      <p className="text-xl font-extrabold text-gray-900 dark:text-foreground leading-none tracking-tight">
        {value}
      </p>
      <p className="text-[11px] font-medium text-gray-400 dark:text-muted leading-tight">
        {label}
      </p>
      {subtitle && (
        <p className="text-[10px] text-gray-400 dark:text-gray-600">{subtitle}</p>
      )}
    </div>
  );
}

function DeltaBadge({ value }: { value: number }) {
  const Icon = value === 0 ? Minus : value > 0 ? TrendingUp : TrendingDown;
  const color = value === 0
    ? "text-gray-500 bg-gray-100 dark:bg-gray-800"
    : value > 0
      ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400"
      : "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400";

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full", color)}>
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
          <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-32" />
        ))}
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-12" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-72" />
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-64" />
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-64" />
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl h-64" />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSoles(n: number): string {
  if (n >= 1000) return `S/ ${(n / 1000).toFixed(1)}k`;
  return `S/ ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
