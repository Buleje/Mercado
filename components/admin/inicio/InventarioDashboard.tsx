"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo, useState } from "react";
import {
  Package, AlertTriangle, Timer, TrendingUp,
  DollarSign,
} from "@buleje/design-system/icons";
import { inventoryValueAtCost, realUnitCost } from "@/lib/chart-helpers";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const InventarioCharts = dynamic(() => import("./InventarioCharts"), { ssr: false });
const InventarioAdvancedCharts = dynamic(
  () => import("./InventarioAdvancedCharts").then((m) => ({ default: m.InventarioAdvancedCharts })),
  { ssr: false },
);
// DashboardSectionHeader removido 2026-04-24 — ver decision UX en render.
import { BulejeDashboardSkeleton } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";

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
  productosSinCosto: number;
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

// Brandon 2026-06-04: valor headline con separador de miles es-PE, redondeado
// al sol (sin centavos) para que el KPI no rompa en 2 líneas. Antes daba
// "S/ 10984.80" (sin separador, partía feo) — ahora "S/ 10,985".
function fmt(n: number) { return `S/ ${Math.round(n).toLocaleString("es-PE")}`; }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

const CAT_LABELS: Record<string, string> = { "frutas-verduras": "Frutas y Verduras", abarrotes: "Abarrotes", carnes: "Carnes", lacteos: "Lácteos", bebidas: "Bebidas", limpieza: "Limpieza" };
const CAT_COLORS: Record<string, string> = { "frutas-verduras": "#10b981", abarrotes: "#ff6b5b", carnes: "#ef4444", lacteos: "#3b82f6", bebidas: "#8b5cf6", limpieza: "#06b6d4" };

// ── Main Component ───────────────────────────────────────────────────────────

interface InventarioDashboardProps {
  dateRange: DateRange;
  onChangeRange?: (r: DateRange) => void;
}

export default function InventarioDashboard({ dateRange, onChangeRange }: InventarioDashboardProps) {
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
    const periodOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= from && new Date(o.createdAt) <= to);
    const periodSales = sales.filter(s => new Date(s.createdAt) >= from && new Date(s.createdAt) <= to);

    // Previous period for delta
    const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
    const prevTo = new Date(from.getTime() - 1);
    const prevOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= prevFrom && new Date(o.createdAt) <= prevTo);
    const prevSales = sales.filter(s => new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);

    // KPIs — valor a COSTO REAL (helper único, sin fabricar price*0.7).
    const { valor: valorInventario, sinCosto: productosSinCosto } = inventoryValueAtCost(active);
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
      const cUnit = realUnitCost(p);
      if (cUnit != null) e.valor += (p.stock ?? 0) * cUnit;
      e.cantidad += p.stock ?? 0;
      catMap.set(cat, e);
    });
    const stockPorCategoria = [...catMap.entries()].map(([c, v]) => ({
      nombre: CAT_LABELS[c] ?? c, valor: v.valor, cantidad: v.cantidad, color: CAT_COLORS[c] ?? "#94a3b8",
    })).sort((a, b) => b.valor - a.valor);

    // Stockout projection (30-day based)
    const last30 = new Date(now - 30 * 86400000);
    const prodSales30d = new Map<number, number>();
    orders.filter(o => new Date(o.createdAt) >= last30 && o.status === "entregado").forEach(o =>
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
      { label: "1-10 uds", min: 1, max: 10, color: "#ff6b5b" },
      { label: "11-50 uds", min: 11, max: 50, color: "#3b82f6" },
      { label: "51-100 uds", min: 51, max: 100, color: "#06b6d4" },
      { label: "100+ uds", min: 101, max: Infinity, color: "var(--accent)" },
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
      valorInventario, productosSinCosto, totalProductos, stockCritico, agotados, sinMovimiento, rotacionGeneral, dValor,
      stockPorCategoria, proyeccionAgotamiento, productosCriticos, movimientoDiario,
      topSalidas, coberturaDias, distribucionStock,
    };
  }, [raw, dateRange, now]);

  if (loading) return <BulejeDashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
      <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  // Empty state: sin productos cargados — invariante del rango porque
  // inventario es estado actual; pero si no hay ni productos ni movimientos
  // mostramos onboarding inventario.
  if (data.totalProductos === 0) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="productos en inventario"
        onChangeRange={onChangeRange}
        icon={Package}
        title="Tu inventario está vacío"
        description="Agregá productos para empezar a ver stock crítico, rotación, valor invertido y proyección de agotamiento."
        action={{ label: "Agregar producto", href: "/admin?tab=productos" }}
      />
    );
  }

  // Contexto para los sub-valores de los KPIs (Brandon 2026-06-04: las cards
  // tenían mucho espacio vacío y cero contexto — ahora cada número dice algo).
  const totalUnidades = data.stockPorCategoria.reduce((a, c) => a + c.cantidad, 0);
  const categorias = data.stockPorCategoria.length;

  return (
    <div className="space-y-6">
      {/* Hero removido 2026-04-24: los KPI tiles ya comunican el contenido. */}

      {/* ── KPI Hero Row · ADR-068 armonía estricta ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Valor Inventario"
          value={fmt(data.valorInventario)}
          subValue={
            data.productosSinCosto > 0
              ? `${data.productosSinCosto} sin costo · valor parcial`
              : `${totalUnidades.toLocaleString("es-PE")} uds · a costo real`
          }
          icon={DollarSign}
        />
        <StatCard
          label="Productos"
          value={String(data.totalProductos)}
          subValue={`${categorias} ${categorias === 1 ? "categoría" : "categorías"}`}
          icon={Package}
        />
        <StatCard
          label="Stock Crítico"
          value={String(data.stockCritico)}
          subValue={data.stockCritico > 0 ? "bajo el mínimo" : "todo sobre el mínimo"}
          icon={AlertTriangle}
          emphasis={data.stockCritico > 0 ? "error" : "success"}
        />
        <StatCard
          label="Agotados"
          value={String(data.agotados)}
          subValue={data.agotados > 0 ? "reponer ya" : "ninguno"}
          icon={Package}
          emphasis={data.agotados > 0 ? "error" : "success"}
        />
        <StatCard
          label="Sin Movimiento"
          value={String(data.sinMovimiento)}
          subValue="sin ventas en el rango"
          icon={Timer}
          emphasis={data.sinMovimiento > 5 ? "warning" : "neutral"}
        />
        <StatCard
          label="Rotación"
          value={Number(data.rotacionGeneral).toFixed(2)}
          subValue="veces en el periodo"
          icon={TrendingUp}
          delta={data.dValor}
          deltaLabel="vs periodo previo"
        />
      </div>

      {/* ── Alert bar (critical) ── */}
      {(data.agotados > 0 || data.stockCritico > 0) && (
        <div className="flex items-center gap-3 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">
            {data.agotados > 0 && <span>{data.agotados} producto{data.agotados > 1 ? "s" : ""} agotado{data.agotados > 1 ? "s" : ""}</span>}
            {data.agotados > 0 && data.stockCritico > 0 && <span className="mx-1.5 text-[var(--data-error-500)]">·</span>}
            {data.stockCritico > 0 && <span>{data.stockCritico} en stock crítico</span>}
          </p>
        </div>
      )}

      {/* ── Charts base (valor cat, movimiento 14d, top salidas, distribución, cobertura, proyección) ── */}
      <InventarioCharts data={data} />

      {/* ── Charts especializados (ABC, salud, rotación cat, salidas stacked, waterfall, comparativa) ── */}
      <InventarioAdvancedCharts />
    </div>
  );
}
