"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo } from "react";
import {
  Package, ShoppingCart, TrendingUp, AlertTriangle, Timer,
  RefreshCw, Layers,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const ProductosCharts = dynamic(() => import("./ProductosCharts"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number; name: string; category: string;
  price: number; costPrice?: number;
  stock?: number; stockMin?: number; stockMax?: number;
  active: boolean;
}
interface OrderItem { id: number; name: string; price: number; quantity: number; unit: string; image: string }
interface Order {
  id: string;
  items: OrderItem[]; total: number;
  status: string; createdAt: string;
}
interface Sale {
  id: string; total: number; createdAt: string;
  items: { productId: number; name: string; price: number; costPrice?: number; quantity: number; unit: string }[];
}

export interface ProductosData {
  // KPIs
  productosActivos: number;
  unidadesVendidas: number;
  sinMovimiento: number;
  stockCritico: number;
  agotados: number;
  valorInventario: number;
  rotacionPromedio: number;
  // Deltas
  dUnidades: number | null;
  // Charts
  topProductos: { nombre: string; ingresos: number; utilidad: number; unidades: number }[];
  paretoData: { nombre: string; ingresos: number; acumulado: number; clase: "A" | "B" | "C"; color: string }[];
  claseA: number; claseB: number; claseC: number;
  ventasPorCategoria: { nombre: string; total: number; color: string }[];
  stockProjection: { nombre: string; stock: number; diasRestantes: number; diarioPromedio: number; status: "critico" | "alerta" | "ok" }[];
  productosSinMov: { nombre: string; categoria: string; stock: number; precio: number }[];
  afinidades: { productoA: string; productoB: string; coCompras: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

const CAT_LABELS: Record<string, string> = { "frutas-verduras": "Frutas y Verduras", abarrotes: "Abarrotes", carnes: "Carnes", lacteos: "Lácteos", bebidas: "Bebidas", limpieza: "Limpieza" };
const CAT_COLORS: Record<string, string> = { "frutas-verduras": "#10b981", abarrotes: "#f59e0b", carnes: "#ef4444", lacteos: "#3b82f6", bebidas: "#8b5cf6", limpieza: "#06b6d4" };

// ── Main Component ───────────────────────────────────────────────────────────

export default function ProductosDashboard({ dateRange }: { dateRange: DateRange }) {
  const { data: shared, loading, error, refresh } = useDashboardData();
  const refreshing = false;

  const products = (shared?.products ?? []) as Product[];
  const orders = (shared?.orders ?? []) as Order[];
  const sales = (shared?.sales ?? []) as Sale[];
  const raw = shared ? { products, orders, sales } : null;

  const data = useMemo<ProductosData | null>(() => {
    if (!raw) return null;
    const { products, orders, sales } = raw;
    const now = new Date();
    const { from: monthStart, to: monthEnd } = dateRange;
    const rangeDays = Math.max(1, Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000));
    const prevMonthStart = new Date(monthStart.getTime() - rangeDays * 86400000);
    const prevMonthEnd = new Date(monthStart.getTime() - 1);
    const costMap = new Map(products.map(p => [p.id, p.costPrice ?? p.price * 0.7]));

    const mOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= monthStart && new Date(o.createdAt) <= monthEnd);
    const mSales = sales.filter(s => new Date(s.createdAt) >= monthStart && new Date(s.createdAt) <= monthEnd);

    // Active products
    const activeProducts = products.filter(p => p.active);
    const productosActivos = activeProducts.length;

    // Units sold this month
    let unidadesVendidas = 0;
    mOrders.forEach(o => o.items.forEach(i => { unidadesVendidas += i.quantity; }));
    mSales.forEach(s => s.items.forEach(i => { unidadesVendidas += i.quantity; }));

    // Previous month units
    const pOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= prevMonthStart && new Date(o.createdAt) <= prevMonthEnd);
    const pSales = sales.filter(s => new Date(s.createdAt) >= prevMonthStart && new Date(s.createdAt) <= prevMonthEnd);
    let prevUnidades = 0;
    pOrders.forEach(o => o.items.forEach(i => { prevUnidades += i.quantity; }));
    pSales.forEach(s => s.items.forEach(i => { prevUnidades += i.quantity; }));
    const dUnidades = prevUnidades === 0 ? null : ((unidadesVendidas - prevUnidades) / prevUnidades) * 100;

    // Products with no movement
    const soldIds = new Set<number>();
    orders.filter(o => o.status !== "cancelado").forEach(o => o.items.forEach(i => soldIds.add(i.id)));
    sales.forEach(s => s.items.forEach(i => soldIds.add(i.productId)));
    const sinMovimiento = activeProducts.filter(p => !soldIds.has(p.id)).length;
    const productosSinMov = activeProducts.filter(p => !soldIds.has(p.id)).map(p => ({
      nombre: p.name, categoria: CAT_LABELS[p.category] ?? p.category, stock: p.stock ?? 0, precio: p.price,
    })).slice(0, 10);

    // Stock critical & out of stock
    const stockCritico = activeProducts.filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin && p.stock > 0).length;
    const agotados = activeProducts.filter(p => (p.stock ?? 0) === 0).length;

    // Inventory value
    const valorInventario = activeProducts.reduce((a, p) => a + (p.stock ?? 0) * (p.costPrice ?? p.price * 0.7), 0);

    // Average rotation (units sold / avg stock)
    const avgStock = activeProducts.reduce((a, p) => a + (p.stock ?? 0), 0) / Math.max(productosActivos, 1);
    const rotacionPromedio = avgStock > 0 ? unidadesVendidas / avgStock : 0;

    // Top 10 products by revenue/profit/units
    const prodMap = new Map<number, { nombre: string; ingresos: number; utilidad: number; unidades: number }>();
    mOrders.forEach(o => o.items.forEach(i => {
      const e = prodMap.get(i.id) ?? { nombre: i.name, ingresos: 0, utilidad: 0, unidades: 0 };
      const c = costMap.get(i.id) ?? i.price * 0.7;
      e.ingresos += i.price * i.quantity; e.utilidad += (i.price - c) * i.quantity; e.unidades += i.quantity;
      prodMap.set(i.id, e);
    }));
    mSales.forEach(s => s.items.forEach(i => {
      const e = prodMap.get(i.productId) ?? { nombre: i.name, ingresos: 0, utilidad: 0, unidades: 0 };
      const c = costMap.get(i.productId) ?? i.price * 0.7;
      e.ingresos += i.price * i.quantity; e.utilidad += (i.price - c) * i.quantity; e.unidades += i.quantity;
      prodMap.set(i.productId, e);
    }));
    const topProductos = [...prodMap.values()].sort((a, b) => b.ingresos - a.ingresos).slice(0, 10);

    // Pareto ABC
    const allProds = [...prodMap.values()].sort((a, b) => b.ingresos - a.ingresos);
    const totalRevenue = allProds.reduce((a, p) => a + p.ingresos, 0);
    let cumulative = 0;
    const claseAColor = "#00B4A6", claseBColor = "#3b82f6", claseCColor = "#94a3b8";
    const paretoWithClass = allProds.map(p => {
      cumulative += p.ingresos;
      const pct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 0;
      const clase: "A" | "B" | "C" = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
      return { ...p, acumulado: pct, clase, color: clase === "A" ? claseAColor : clase === "B" ? claseBColor : claseCColor };
    });
    const paretoData = paretoWithClass.slice(0, 20).map(p => ({ nombre: p.nombre, ingresos: p.ingresos, acumulado: p.acumulado, clase: p.clase, color: p.color }));
    const claseA = paretoWithClass.filter(p => p.clase === "A").length;
    const claseB = paretoWithClass.filter(p => p.clase === "B").length;
    const claseC = paretoWithClass.filter(p => p.clase === "C").length;

    // Sales by category
    const catMap = new Map<string, number>();
    mOrders.forEach(o => o.items.forEach(i => {
      const cat = products.find(p => p.id === i.id)?.category ?? "otros";
      catMap.set(cat, (catMap.get(cat) ?? 0) + i.price * i.quantity);
    }));
    mSales.forEach(s => s.items.forEach(i => {
      const cat = products.find(p => p.id === i.productId)?.category ?? "otros";
      catMap.set(cat, (catMap.get(cat) ?? 0) + i.price * i.quantity);
    }));
    const ventasPorCategoria = [...catMap.entries()].map(([c, t]) => ({
      nombre: CAT_LABELS[c] ?? c, total: t, color: CAT_COLORS[c] ?? "#94a3b8",
    })).sort((a, b) => b.total - a.total);

    // Stock projection
    const last30 = new Date(now.getTime() - 30 * 86400000);
    const prodSales30d = new Map<number, number>();
    orders.filter(o => new Date(o.createdAt) >= last30 && o.status !== "cancelado").forEach(o =>
      o.items.forEach(i => { prodSales30d.set(i.id, (prodSales30d.get(i.id) ?? 0) + i.quantity); })
    );
    sales.filter(s => new Date(s.createdAt) >= last30).forEach(s =>
      s.items.forEach(i => { prodSales30d.set(i.productId, (prodSales30d.get(i.productId) ?? 0) + i.quantity); })
    );
    const stockProjection = activeProducts
      .filter(p => p.stock != null && p.stock > 0)
      .map(p => {
        const sold = prodSales30d.get(p.id) ?? 0;
        const daily = sold / 30;
        const dias = daily > 0 ? p.stock! / daily : 999;
        return {
          nombre: p.name, stock: p.stock!, diasRestantes: Math.round(dias), diarioPromedio: Math.round(daily * 10) / 10,
          status: (dias < 7 ? "critico" : dias < 14 ? "alerta" : "ok") as "critico" | "alerta" | "ok",
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 10);

    // Product affinities (co-purchase)
    const coMap = new Map<string, { a: string; b: string; count: number }>();
    const baskets = [
      ...orders.filter(o => o.status !== "cancelado").map(o => o.items.map(i => ({ id: i.id, name: i.name }))),
      ...sales.map(s => s.items.map(i => ({ id: i.productId, name: i.name }))),
    ];
    baskets.forEach(basket => {
      const unique = [...new Map(basket.map(i => [i.id, i])).values()];
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = [unique[i].id, unique[j].id].sort((a, b) => a - b).join("-");
          const e = coMap.get(key) ?? { a: unique[i].name, b: unique[j].name, count: 0 };
          e.count++; coMap.set(key, e);
        }
      }
    });
    const afinidades = [...coMap.values()].filter(x => x.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8)
      .map(x => ({ productoA: x.a, productoB: x.b, coCompras: x.count }));

    return {
      productosActivos, unidadesVendidas, sinMovimiento, stockCritico, agotados, valorInventario, rotacionPromedio,
      dUnidades, topProductos, paretoData, claseA, claseB, claseC,
      ventasPorCategoria, stockProjection, productosSinMov, afinidades,
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
        <StatCard label="Productos Activos" value={String(data.productosActivos)} icon={Package} />
        <StatCard label="Uds. Vendidas" value={String(data.unidadesVendidas)} icon={ShoppingCart} delta={data.dUnidades} />
        <StatCard label="Sin Movimiento" value={String(data.sinMovimiento)} icon={Timer} emphasis={data.sinMovimiento > 5 ? "warning" : "neutral"} />
        <StatCard label="Stock Crítico" value={String(data.stockCritico)} icon={AlertTriangle} emphasis={data.stockCritico > 0 ? "error" : "success"} />
        <StatCard label="Agotados" value={String(data.agotados)} icon={Package} emphasis={data.agotados > 0 ? "error" : "success"} />
        <StatCard label="Valor Inventario" value={fmt(data.valorInventario)} icon={Layers} />
      </div>

      {/* ── Rotación indicator ── */}
      <div className="flex items-center gap-3 bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl px-5 py-3">
        <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin text-[var(--text-tertiary)]" : "text-[var(--text-tertiary)]")} />
        <div className="flex-1 flex items-center gap-4 text-sm">
          <span className="text-[var(--text-secondary)] dark:text-muted">Rotación promedio:</span>
          <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{data.rotacionPromedio.toFixed(1)}x</span>
          <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">(uds vendidas / stock promedio)</span>
        </div>
        {data.claseA > 0 && (
          <div className="hidden sm:flex items-center gap-3 text-[length:var(--ts-xs)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--accent-soft)]" />A: {data.claseA}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--accent-soft)]" />B: {data.claseB}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />C: {data.claseC}</span>
          </div>
        )}
      </div>

      {/* ── Charts ── */}
      <ProductosCharts data={data} />
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-28" />
        ))}
      </div>
      <div className="bg-[var(--surface-sunken)] rounded-xl h-12" />
      <div className="bg-[var(--surface-sunken)] rounded-xl h-[420px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-[260px]" />)}
      </div>
    </div>
  );
}
