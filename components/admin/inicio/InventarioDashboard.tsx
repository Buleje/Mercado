"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo, useState } from "react";
import {
  Package, AlertTriangle, Timer, TrendingDown, TrendingUp,
  ArrowUpRight, ArrowDownRight, RefreshCw, Layers, ShoppingCart,
  DollarSign, BarChart3,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const InventarioCharts = dynamic(() => import("./InventarioCharts"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number; name: string; category: string;
  price: number; costPrice?: number;
  stock?: number; stockMin?: number; stockMax?: number;
  active: boolean;
}
interface OrderItem { id: number; name: string; price: number; quantity: number; unit: string; image: string }
interface Order { id: string; items: OrderItem[]; total: number; status: string; createdAt: string; }
interface Sale { id: string; total: number; createdAt: string; items: { productId: number; name: string; price: number; quantity: number; unit: string }[]; }

export interface InventarioData {
  // KPIs
  valorInventario: number;
  totalProductos: number;
  stockCritico: number;
  agotados: number;
  sinMovimiento: number;
  rotacionGeneral: number;
  // Deltas
  dValor: number | null;
  // Charts
  stockPorCategoria: { nombre: string; valor: number; cantidad: number; color: string }[];
  proyeccionAgotamiento: { nombre: string; stock: number; diasRestantes: number; diario: number; status: "critico" | "alerta" | "ok" }[];
  productosCriticos: { nombre: string; stock: number; stockMin: number; categoria: string; reorder: number }[];
  movimientoDiario: { dia: string; entradas: number; salidas: number }[];
  topSalidas: { nombre: string; unidades: number; tendencia: "up" | "down" | "flat" }[];
  coberturaDias: { nombre: string; dias: number; status: "critico" | "alerta" | "ok" }[];
  distribucionStock: { rango: string; cantidad: number; color: string }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

const CAT_LABELS: Record<string, string> = { "frutas-verduras": "Frutas y Verduras", abarrotes: "Abarrotes", carnes: "Carnes", lacteos: "Lácteos", bebidas: "Bebidas", limpieza: "Limpieza" };
const CAT_COLORS: Record<string, string> = { "frutas-verduras": "#10b981", abarrotes: "#f59e0b", carnes: "#ef4444", lacteos: "#3b82f6", bebidas: "#8b5cf6", limpieza: "#06b6d4" };

// ── Main Component ───────────────────────────────────────────────────────────

interface InventarioDashboardProps {
  dateRange: DateRange;
}

export default function InventarioDashboard({ dateRange }: InventarioDashboardProps) {
  const [now] = useState(() => Date.now());
  const { data: shared, loading, error, refresh } = useDashboardData();

  const products = (shared?.products ?? []) as Product[];
  const orders = (shared?.orders ?? []) as Order[];
  const sales = (shared?.sales ?? []) as Sale[];
  const raw = shared ? { products, orders, sales } : null;

  const data = useMemo<InventarioData | null>(() => {
    if (!raw) return null;
    const { products, orders, sales } = raw;
    const { from, to } = dateRange;
    const active = products.filter(p => p.active);

    // Filter by date range
    const periodOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= from && new Date(o.createdAt) <= to);
    const periodSales = sales.filter(s => new Date(s.createdAt) >= from && new Date(s.createdAt) <= to);

    // Previous period for delta
    const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
    const prevTo = new Date(from.getTime() - 1);
    const prevOrders = orders.filter(o => o.status !== "cancelado" && new Date(o.createdAt) >= prevFrom && new Date(o.createdAt) <= prevTo);
    const prevSales = sales.filter(s => new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);

    // KPIs
    const valorInventario = active.reduce((a, p) => a + (p.stock ?? 0) * (p.costPrice ?? p.price * 0.7), 0);
    const totalProductos = active.length;
    const stockCritico = active.filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin && p.stock > 0).length;
    const agotados = active.filter(p => (p.stock ?? 0) === 0).length;

    // Without movement in period
    const soldIds = new Set<number>();
    periodOrders.forEach(o => o.items.forEach(i => soldIds.add(i.id)));
    periodSales.forEach(s => s.items.forEach(i => soldIds.add(i.productId)));
    const sinMovimiento = active.filter(p => !soldIds.has(p.id)).length;

    // Rotation
    let unitsSold = 0;
    periodOrders.forEach(o => o.items.forEach(i => { unitsSold += i.quantity; }));
    periodSales.forEach(s => s.items.forEach(i => { unitsSold += i.quantity; }));
    const avgStock = active.reduce((a, p) => a + (p.stock ?? 0), 0) / Math.max(totalProductos, 1);
    const rotacionGeneral = avgStock > 0 ? unitsSold / avgStock : 0;

    // Delta for inventory value (compare usage velocity)
    let prevUnitsSold = 0;
    prevOrders.forEach(o => o.items.forEach(i => { prevUnitsSold += i.quantity; }));
    prevSales.forEach(s => s.items.forEach(i => { prevUnitsSold += i.quantity; }));
    const dValor = prevUnitsSold === 0 ? null : ((unitsSold - prevUnitsSold) / prevUnitsSold) * 100;

    // Stock by category
    const catMap = new Map<string, { valor: number; cantidad: number }>();
    active.forEach(p => {
      const cat = p.category;
      const e = catMap.get(cat) ?? { valor: 0, cantidad: 0 };
      e.valor += (p.stock ?? 0) * (p.costPrice ?? p.price * 0.7);
      e.cantidad += p.stock ?? 0;
      catMap.set(cat, e);
    });
    const stockPorCategoria = [...catMap.entries()].map(([c, v]) => ({
      nombre: CAT_LABELS[c] ?? c, valor: v.valor, cantidad: v.cantidad, color: CAT_COLORS[c] ?? "#94a3b8",
    })).sort((a, b) => b.valor - a.valor);

    // Stockout projection (30-day based)
    const last30 = new Date(now - 30 * 86400000);
    const prodSales30d = new Map<number, number>();
    orders.filter(o => new Date(o.createdAt) >= last30 && o.status !== "cancelado").forEach(o =>
      o.items.forEach(i => { prodSales30d.set(i.id, (prodSales30d.get(i.id) ?? 0) + i.quantity); })
    );
    sales.filter(s => new Date(s.createdAt) >= last30).forEach(s =>
      s.items.forEach(i => { prodSales30d.set(i.productId, (prodSales30d.get(i.productId) ?? 0) + i.quantity); })
    );
    const proyeccionAgotamiento = active.filter(p => p.stock != null && p.stock > 0).map(p => {
      const sold = prodSales30d.get(p.id) ?? 0;
      const daily = sold / 30;
      const dias = daily > 0 ? p.stock! / daily : 999;
      return { nombre: p.name, stock: p.stock!, diasRestantes: Math.round(dias), diario: Math.round(daily * 10) / 10, status: (dias < 7 ? "critico" : dias < 14 ? "alerta" : "ok") as "critico" | "alerta" | "ok" };
    }).sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 12);

    // Critical products needing reorder
    const productosCriticos = active
      .filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin)
      .map(p => ({
        nombre: p.name, stock: p.stock!, stockMin: p.stockMin!, categoria: CAT_LABELS[p.category] ?? p.category,
        reorder: (p.stockMax ?? p.stockMin! * 3) - p.stock!,
      }))
      .sort((a, b) => (a.stock / a.stockMin) - (b.stock / b.stockMin))
      .slice(0, 10);

    // Daily movement (entries vs exits) in period
    const exitMap = new Map<string, number>();
    const entryMap = new Map<string, number>();
    periodOrders.forEach(o => { const k = dateKey(new Date(o.createdAt)); o.items.forEach(i => { exitMap.set(k, (exitMap.get(k) ?? 0) + i.quantity); }); });
    periodSales.forEach(s => { const k = dateKey(new Date(s.createdAt)); s.items.forEach(i => { exitMap.set(k, (exitMap.get(k) ?? 0) + i.quantity); }); });
    // For entries we don't have purchase data yet so we estimate 0 (API doesn't return detailed purchase line items)
    const allDays = new Set([...exitMap.keys(), ...entryMap.keys()]);
    const sortedDays = [...allDays].sort();
    const movimientoDiario = sortedDays.slice(-14).map(k => ({
      dia: dayLabel(k), entradas: entryMap.get(k) ?? 0, salidas: exitMap.get(k) ?? 0,
    }));

    // Top products by units exiting
    const exitProd = new Map<number, { name: string; units: number }>();
    periodOrders.forEach(o => o.items.forEach(i => { const e = exitProd.get(i.id) ?? { name: i.name, units: 0 }; e.units += i.quantity; exitProd.set(i.id, e); }));
    periodSales.forEach(s => s.items.forEach(i => { const e = exitProd.get(i.productId) ?? { name: i.name, units: 0 }; e.units += i.quantity; exitProd.set(i.productId, e); }));
    // Trend: compare vs previous period
    const prevExitProd = new Map<number, number>();
    prevOrders.forEach(o => o.items.forEach(i => { prevExitProd.set(i.id, (prevExitProd.get(i.id) ?? 0) + i.quantity); }));
    prevSales.forEach(s => s.items.forEach(i => { prevExitProd.set(i.productId, (prevExitProd.get(i.productId) ?? 0) + i.quantity); }));
    const topSalidas = [...exitProd.entries()]
      .sort((a, b) => b[1].units - a[1].units)
      .slice(0, 10)
      .map(([id, v]) => {
        const prev = prevExitProd.get(id) ?? 0;
        const tendencia: "up" | "down" | "flat" = v.units > prev ? "up" : v.units < prev ? "down" : "flat";
        return { nombre: v.name, unidades: v.units, tendencia };
      });

    // Coverage days (stock / daily avg)
    const coberturaDias = active.filter(p => p.stock != null && p.stock > 0).map(p => {
      const sold = prodSales30d.get(p.id) ?? 0;
      const daily = sold / 30;
      const dias = daily > 0 ? Math.round(p.stock! / daily) : 999;
      return { nombre: p.name, dias, status: (dias < 7 ? "critico" : dias < 14 ? "alerta" : "ok") as "critico" | "alerta" | "ok" };
    }).sort((a, b) => a.dias - b.dias).slice(0, 10);

    // Stock distribution
    const ranges = [
      { label: "Sin stock", min: 0, max: 0, color: "#ef4444" },
      { label: "1-10 uds", min: 1, max: 10, color: "#f59e0b" },
      { label: "11-50 uds", min: 11, max: 50, color: "#3b82f6" },
      { label: "51-100 uds", min: 51, max: 100, color: "#06b6d4" },
      { label: "100+ uds", min: 101, max: Infinity, color: "#00B4A6" },
    ];
    const distribucionStock = ranges.map(r => ({
      rango: r.label,
      cantidad: active.filter(p => {
        const s = p.stock ?? 0;
        return s >= r.min && s <= r.max;
      }).length,
      color: r.color,
    }));

    return {
      valorInventario, totalProductos, stockCritico, agotados, sinMovimiento, rotacionGeneral, dValor,
      stockPorCategoria, proyeccionAgotamiento, productosCriticos, movimientoDiario,
      topSalidas, coberturaDias, distribucionStock,
    };
  }, [raw, dateRange, now]);

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
        <StatCard label="Valor Inventario" value={fmt(data.valorInventario)} icon={DollarSign} />
        <StatCard label="Productos" value={String(data.totalProductos)} icon={Package} />
        <StatCard label="Stock Crítico" value={String(data.stockCritico)} icon={AlertTriangle} emphasis={data.stockCritico > 0 ? "error" : "success"} />
        <StatCard label="Agotados" value={String(data.agotados)} icon={Package} emphasis={data.agotados > 0 ? "error" : "success"} />
        <StatCard label="Sin Movimiento" value={String(data.sinMovimiento)} icon={Timer} emphasis={data.sinMovimiento > 5 ? "warning" : "neutral"} />
        <StatCard label="Rotación" value={data.rotacionGeneral.toFixed(2)} icon={TrendingUp} delta={data.dValor} />
      </div>

      {/* ── Alert bar (critical) ── */}
      {(data.agotados > 0 || data.stockCritico > 0) && (
        <div className="flex items-center gap-3 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)]/30 rounded-xl px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-[var(--data-error)] shrink-0" />
          <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)] font-medium">
            {data.agotados > 0 && <span>{data.agotados} producto{data.agotados > 1 ? "s" : ""} agotado{data.agotados > 1 ? "s" : ""}</span>}
            {data.agotados > 0 && data.stockCritico > 0 && <span className="mx-1.5 text-[var(--data-error)]">·</span>}
            {data.stockCritico > 0 && <span>{data.stockCritico} en stock crítico</span>}
          </p>
        </div>
      )}

      {/* ── Charts ── */}
      <InventarioCharts data={data} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, Icon, delta, accent }: {
  label: string; value: string;
  Icon: React.ComponentType<{ className?: string }>;
  delta?: number | null;
  accent: "emerald" | "blue" | "violet" | "cyan" | "amber" | "red";
}) {
  const isPositive = delta != null ? delta >= 0 : false;
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

// ── Skeleton ──────────────────────────────────────────────────────────────────

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
