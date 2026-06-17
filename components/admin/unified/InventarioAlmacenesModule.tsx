"use client";
import { CardTitle } from "@buleje/design-system";
 
import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Treemap, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { exportToExcel } from "@/lib/export-excel";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import {
  LayoutDashboard, AlertTriangle, Package, ArrowLeftRight, CalendarClock,
  TrendingUp, DollarSign, Boxes, AlertCircle, XCircle, Hash, RotateCw,
  ListChecks, Maximize2, X as XIcon,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import ChartExpandModal from "@/components/admin/shared/ChartExpandModal";
import DashboardSkeleton from "@/components/admin/shared/DashboardSkeleton";
import EmptyState from "@/components/admin/shared/EmptyState";
import ExportButton from "@/components/admin/shared/ExportButton";
import PeriodSelector from "@/components/admin/shared/PeriodSelector";
import FavStar from "@/components/admin/shared/FavStar";
import KpiCard from "@/components/admin/shared/KPICard";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Existing tabs ──
const InventoryTab = dynamic(() => import("@/components/admin/InventoryTab"), { loading: S });
const SimpleMovementsTab = dynamic(() => import("@/components/admin/inventario/SimpleMovementsTab"), { loading: S });
const SimpleExpiryTab = dynamic(() => import("@/components/admin/inventario/SimpleExpiryTab"), { loading: S });
const PhysicalCountTab = dynamic(() => import("@/components/admin/PhysicalCountTab"), { loading: S });
const QuickStockCounter = dynamic(() => import("@/components/admin/QuickStockCounter"), { loading: S });

// ── New Upgrade tabs ──
const ConteoFisicoWizard = dynamic(() => import("@/components/admin/inventario/ConteoFisicoWizard"), { loading: S });
const DeclaracionInventarioModule = dynamic(() => import("@/components/admin/DeclaracionInventarioModule"), { loading: S });
const DemandForecast = dynamic(() => import("@/components/admin/inventario/DemandForecast"), { loading: S });
const BarcodeScanner = dynamic(() => import("@/components/admin/inventario/BarcodeScanner"), { ssr: false, loading: S });

const MODULE_ID = "inventario";

const TABS = [
  // ── Grupo 1: Stock ──
  { id: "stock" as const, label: "Stock", icon: Package },
  // ── Grupo 2: Entradas y Salidas ──
  { id: "kardex" as const, label: "Entradas y Salidas", icon: ArrowLeftRight },
  // ── Grupo 3: Vencimientos ──
  { id: "lotes" as const, label: "Vencimientos", icon: CalendarClock },
];

// ── Mejora 8: Category Treemap View ─────────────────────────────────────────

interface TreemapProduct {
  id: number;
  name: string;
  category: string;
  stock: number | null;
  costPrice: number | null;
  price: number;
  barcode?: string | null;
  active: boolean;
}

// Custom treemap content renderer
function TreemapContent(props: {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; fill?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, fill } = props;
  if (width < 40 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} rx={4} />
      <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central"
        fill="#fff" fontSize={width < 80 ? 10 : 12} fontWeight="bold">
        {(name ?? "").length > 12 ? (name ?? "").slice(0, 10) + "..." : name}
      </text>
    </g>
  );
}

function CategoryTreemapView() {
  const [products, setProducts] = useState<TreemapProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setProducts(data.filter((p: TreemapProduct) => p.active));
      })
      .catch((err) => console.warn("[InventarioAlmacenesModule] products fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Group by category
  const categoryMap: Record<string, { value: number; count: number }> = {};
  for (const p of products) {
    const cat = p.category || "otros";
    if (!categoryMap[cat]) categoryMap[cat] = { value: 0, count: 0 };
    categoryMap[cat].value += (p.stock ?? 0) * (p.costPrice ?? p.price);
    categoryMap[cat].count += 1;
  }

  const COLORS: Record<string, string> = {
    abarrotes: "var(--color-primary)", bebidas: "#3B82F6", limpieza: "#14C2C2",
    lacteos: "#457b9d", carnes: "#e63946", "frutas-verduras": "#95d5b2",
    snacks: "#ff6b5b", otros: "#6b705c", congelados: "#264653",
    cuidado_personal: "#9b5de5",
  };

  const treemapData = Object.entries(categoryMap)
    .filter(([, v]) => v.value > 0)
    .map(([name, v]) => ({
      name,
      size: Math.round(v.value),
      count: v.count,
      fill: COLORS[name] || "#6b705c",
    }))
    .sort((a, b) => b.size - a.size);

  const totalValue = treemapData.reduce((s, d) => s + d.size, 0);

  // Mejora 9: SUNAT export function
  const handleExportSunat = () => {
    const fecha = new Date().toISOString().slice(0, 10);
    const dataSunat = products.map(p => ({
      "Codigo": p.barcode || `PROD-${p.id}`,
      "Descripcion": p.name,
      "Unidad": "NIU",
      "Cantidad": p.stock ?? 0,
      "Costo Unit.": Number(p.costPrice ?? 0).toFixed(2),
      "Valor Total": ((p.stock ?? 0) * Number(p.costPrice ?? 0)).toFixed(2),
    }));
    exportToExcel(dataSunat, `inventario-sunat-${fecha}`, "Inventario SUNAT");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">Vista General del Inventario</CardTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            Valor total: <strong className="text-[var(--color-primary)]">{formatCurrency(totalValue, { decimals: 0 })}</strong> en {products.length} productos
          </p>
        </div>
        {/* Mejora 9: SUNAT export button */}
        <button
          onClick={handleExportSunat}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--data-success-500)]/30 text-[var(--data-success-500)] text-sm font-bold hover:bg-[var(--accent-soft)] transition-colors"
        >
          Exportar para Contador
        </button>
      </div>

      {treemapData.length === 0 ? (
        <p className="text-center text-[var(--text-tertiary)] py-8">No hay datos de inventario para mostrar</p>
      ) : (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
          <ResponsiveContainer minWidth={0} width="100%" height={320}>
            <Treemap
              data={treemapData}
              dataKey="size"
              nameKey="name"
              content={<TreemapContent />}
            >
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { name: string; size: number; count: number } | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl px-3 py-2 text-xs">
                      <p className="font-bold text-[var(--text-primary)] capitalize">{d.name}</p>
                      <p className="text-[var(--text-secondary)]">Valor: {formatCurrency(d.size, { decimals: 0 })}</p>
                      <p className="text-[var(--text-secondary)]">{d.count} productos</p>
                    </div>
                  );
                }}
              />
            </Treemap>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--rule-soft)]">
            {treemapData.map((d, i) => (
              <div key={d.name || i} className="flex items-center gap-1.5 text-xs">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                <span className="text-[var(--text-secondary)] capitalize">{d.name}</span>
                <span className="font-bold text-[var(--text-primary)]">{formatCurrency(d.size, { decimals: 0 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics Dashboard (tab Análisis) ──────────────────────────────────────

const ANALYTICS_COLORS = ["var(--color-primary)", "#ff6b5b", "#457b9d", "#e63946", "#9b5de5", "#14C2C2", "#6b705c", "#264653"];



function InventoryAnalyticsDashboard() {
  const [products, setProducts] = useState<TreemapProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const invFavs = useFavoriteCharts("inventario");
  // Mejora 12: Click-to-filter PieChart categorias
  const [pieFilter, setPieFilter] = useState<string | null>(null);
  // Mejora 13: Expand chart
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("30d");
  // Mejora 3: Auto-refresh

  const fetchData = useCallback(() => {
    fetch(`/api/products?period=${period}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const arr = Array.isArray(data) ? data : data.products || [];
        setProducts(arr.filter((p: TreemapProduct) => p.active !== false));
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const autoRefresh = useAutoRefresh({ intervalSeconds: 300, onRefresh: fetchData });

  // ── KPIs ──
  const kpis = useMemo(() => {
    const valorTotal = products.reduce((s, p) => s + (p.stock ?? 0) * (p.costPrice ?? 0), 0);
    const activos = products.filter(p => (p.stock ?? 0) > 0).length;
    const criticos = products.filter(p => {
      const minStock = (p as TreemapProduct & { stockMin?: number }).stockMin;
      return minStock != null && (p.stock ?? 0) <= minStock && (p.stock ?? 0) > 0;
    }).length;
    const sinStock = products.filter(p => (p.stock ?? 0) === 0).length;
    const total = products.length;
    const rotacion = total > 0 ? +(activos / total * 100).toFixed(1) : 0;
    return { valorTotal, activos, criticos, sinStock, total, rotacion };
  }, [products]);

  // ── Category data ──
  const categoryData = useMemo(() => {
    const groups: Record<string, { count: number; value: number; units: number }> = {};
    products.forEach(p => {
      const cat = p.category || "Otros";
      if (!groups[cat]) groups[cat] = { count: 0, value: 0, units: 0 };
      groups[cat].count++;
      groups[cat].value += (p.stock ?? 0) * (p.costPrice ?? p.price ?? 0);
      groups[cat].units += p.stock ?? 0;
    });
    return Object.entries(groups)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.value - a.value);
  }, [products]);

  const categoryTotal = useMemo(() => categoryData.reduce((s, c) => s + c.value, 0), [categoryData]);

  // ── Top 10 by value ──
  const top10Value = useMemo(() => {
    return products
      .map(p => ({
        name: p.name.length > 20 ? p.name.slice(0, 18) + "..." : p.name,
        fullName: p.name,
        value: (p.stock ?? 0) * (p.costPrice ?? p.price ?? 0),
        units: p.stock ?? 0,
        unitCost: p.costPrice ?? p.price ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [products]);

  // ── Scatter / Rotation data ──
  // dailySales ficticios eliminados (A2 Bundle-A). Se necesitan ventas reales del backend
  // para calcular rotación. Los charts de dispersión se ocultan hasta tener data real.

  // ── Depletion forecast ──
  // dailySales estimados eliminados (A2 Bundle-A). Sin historial de ventas real,
  // "días restantes" es un dato inventado. Se muestra solo stock actual.
  const depletionData = useMemo(() => {
    return products
      .filter(p => (p.stock ?? 0) > 0)
      .map(p => {
        const stock = p.stock ?? 0;
        const minStock = (p as TreemapProduct & { stockMin?: number }).stockMin ?? 0;
        const maxStock = (p as TreemapProduct & { maxStock?: number }).maxStock ?? Math.max(stock * 2, 50);
        const pct = Math.min((stock / Math.max(maxStock, 1)) * 100, 100);
        // daysLeft = null — no hay datos reales de velocidad de venta
        return { name: p.name, stock, daysLeft: null as null, pct, minStock };
      })
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10);
  }, [products]);

  if (loading) return <DashboardSkeleton kpis={6} />;

  if (products.length === 0) {
    return (
      <EmptyState icon={TrendingUp} title="No hay productos para analizar" description="Los datos apareceran cuando registres productos" />
    );
  }

  const kpiCards = [
    { label: "Valor total", value: formatCurrency(kpis.valorTotal, { decimals: 0 }), icon: DollarSign, color: "var(--color-primary)" },
    { label: "Activos", value: kpis.activos.toLocaleString(), icon: Boxes, color: "#3B82F6" },
    { label: "Criticos", value: kpis.criticos.toLocaleString(), icon: AlertCircle, color: "#ff6b5b", alert: kpis.criticos > 0 },
    { label: "Sin stock", value: kpis.sinStock.toLocaleString(), icon: XCircle, color: "#EF4444", alert: kpis.sinStock > 0 },
    { label: "Total SKUs", value: kpis.total.toLocaleString(), icon: Hash, color: "#6B7280" },
    { label: "Rotacion", value: `${kpis.rotacion}%`, icon: RotateCw, color: "#8B5CF6" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Controls: Period + Refresh + Export ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <AutoRefreshControl secondsLeft={autoRefresh.secondsLeft} paused={autoRefresh.paused} isActive={autoRefresh.isActive} onTogglePause={autoRefresh.togglePause} onRefreshNow={autoRefresh.refreshNow} />
          <ExportButton />
        </div>
      </div>

      {/* ── Alertas Inventario ── */}
      {(kpis.sinStock > 0 || kpis.criticos > 0) && (
        <div className="flex flex-wrap gap-2">
          {kpis.sinStock > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)]"><AlertTriangle className="h-3 w-3" /> {kpis.sinStock} productos sin stock</span>}
          {kpis.criticos > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"><AlertTriangle className="h-3 w-3" /> {kpis.criticos} productos en nivel critico</span>}
        </div>
      )}

      {/* ── 1. KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((k, i) => (
          <KpiCard key={k.label} label={k.label} value={k.value} icon={k.icon} color={k.color} alert={k.alert} />
        ))}
      </div>

      {/* ── 2. Distribucion por Categoria ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Valor por Categoria</h4>
            <div className="flex items-center gap-2">
              {pieFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {pieFilter}
                  <button onClick={() => setPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
                </span>
              )}
              <button onClick={() => setExpandedChart("categoria")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
              <FavStar id="categoria" favs={invFavs} />
            </div>
          </div>
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                className="cursor-pointer"
                label={(props: PieLabelRenderProps) => `${(props as PieLabelRenderProps & { name?: string }).name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                onClick={(_: unknown, idx: number) => setPieFilter(prev => prev === categoryData[idx]?.name ? null : categoryData[idx]?.name ?? null)}
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { name: string; value: number; count: number; units: number } | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl px-3 py-2 text-xs">
                      <p className="font-bold text-[var(--text-primary)] capitalize">{d.name}</p>
                      <p className="text-[var(--text-secondary)]">Valor: {formatCurrency(d.value, { decimals: 0 })}</p>
                      <p className="text-[var(--text-secondary)]">{d.count} productos | {d.units} unidades</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-[var(--text-tertiary)] mt-1">
            Total: <strong className="text-primary">{formatCurrency(categoryTotal, { decimals: 0 })}</strong>
          </p>
        </div>

        {/* Bar Chart */}
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Unidades por Categoria</h4>
            <FavStar id="unidades" favs={invFavs} />
          </div>
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis
                dataKey="name"
                type="category"
                width={80}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 10) + "..." : v}
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { name: string; units: number; count: number } | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl px-3 py-2 text-xs">
                      <p className="font-bold capitalize">{d.name}</p>
                      <p className="text-[var(--text-secondary)]">{d.units} unidades en {d.count} productos</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="units" radius={[0, 6, 6, 0]}>
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 3. Top 10 Productos por Valor ── */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Top 10 Productos por Valor en Stock</h4>
          <FavStar id="top10" favs={invFavs} />
        </div>
        <ResponsiveContainer minWidth={0} width="100%" height={300}>
          <BarChart data={top10Value} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `S/${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
            <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10, fill: "#6b7280" }} />
            <Tooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0]?.payload as { fullName: string; value: number; units: number; unitCost: number } | undefined;
                if (!d) return null;
                return (
                  <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl px-3 py-2 text-xs">
                    <p className="font-bold text-[var(--text-primary)]">{d.fullName}</p>
                    <p className="text-primary font-bold">{formatCurrency(d.value, { decimals: 0 })}</p>
                    <p className="text-[var(--text-secondary)]">{d.units} unid x S/ {Number(d.unitCost).toFixed(2)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {/* Mejora 10: Mini-avatar con iniciales */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--rule-soft)]">
          {top10Value.slice(0, 10).map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0">{p.name.charAt(0)}</div>
              <span className="text-xs text-[var(--text-secondary)] truncate max-w-[80px]">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Análisis de Rotación: sección placeholder eliminada (audit
          2026-05-29) — siempre mostraba "Sin datos suficientes" y generaba
          desconfianza ("¿está roto?"). La rotación real ya está en el KPI de
          arriba. Re-agregar como sección solo cuando se implemente de verdad. ── */}

      {/* ── 5. Productos mas rentables (por margen real) ── */}
      {(() => {
        // ventasEst ficticio eliminado (A2 Bundle-A). Se ordena por margen % real.
        const rentables = products
          .filter(p => (p.stock ?? 0) > 0 && p.costPrice != null && p.price != null && p.price > (p.costPrice ?? 0))
          .map(p => {
            const margen = p.price && p.costPrice ? ((p.price - p.costPrice) / p.price) * 100 : 0;
            return {
              name: p.name.length > 20 ? p.name.slice(0, 18) + "..." : p.name,
              fullName: p.name,
              ganancia: +margen.toFixed(2),
              margen: +margen.toFixed(1),
              ventasEst: null as null,
            };
          })
          .sort((a, b) => b.ganancia - a.ganancia)
          .slice(0, 10);

        return rentables.length > 0 ? (
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
            <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">Productos mas rentables</h4>
            <ResponsiveContainer minWidth={0} width="100%" height={300}>
              <BarChart data={rentables} layout="vertical" margin={{ left: 10, right: 30 }}>
                <defs>
                  <linearGradient id="rentGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--color-primary)" />
                    <stop offset="100%" stopColor="#ff6b5b" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `S/${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload as { fullName: string; margen: number; ganancia: number } | undefined;
                    if (!d) return null;
                    return (
                      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl px-3 py-2 text-xs">
                        <p className="font-bold text-[var(--text-primary)]">{d.fullName}</p>
                        <p className="text-primary font-bold">Margen: {d.margen}%</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="ganancia" fill="url(#rentGrad)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null;
      })()}

      {/* ── 6. Prediccion de Agotamiento ── */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Prediccion de Agotamiento</h4>
          <FavStar id="agotamiento" favs={invFavs} />
        </div>
        <div className="space-y-2">
          {depletionData.map((item, i) => {
            // Color basado en % de stock vs máximo (sin velocidad de venta ficticia)
            const color = item.pct <= 20 ? "red" : item.pct <= 40 ? "amber" : "emerald";
            const colorClasses = {
              red: { bg: "bg-[var(--data-error-500)]", text: "text-[var(--data-error-500)]", track: "bg-red-100" },
              amber: { bg: "bg-[var(--data-warning-500)]", text: "text-[var(--data-warning-500)]", track: "bg-amber-100" },
              emerald: { bg: "bg-[var(--accent-soft)]", text: "text-[var(--data-success-500)]", track: "bg-[var(--accent-soft)]" },
            }[color];
            return (
              <div key={item.name || i} className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-primary)] w-36 sm:w-48 truncate shrink-0" title={item.name}>{item.name}</span>
                <div className={cn("flex-1 h-3 rounded-full overflow-hidden", colorClasses.track)}>
                  <div
                    className={cn("h-full rounded-full transition-all", colorClasses.bg)}
                    style={{ width: `${Math.max(item.pct, 3)}%` }}
                  />
                </div>
                <span className={cn("text-xs font-bold shrink-0 w-14 text-right", colorClasses.text)}>
                  {item.stock}u
                </span>
              </div>
            );
          })}
        </div>
        {depletionData.length === 0 && (
          <p className="text-xs text-[var(--text-tertiary)] text-center py-4">Todos los productos tienen stock suficiente</p>
        )}
      </div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <ChartExpandModal title="Valor por Categoria" onClose={() => setExpandedChart(null)}>
            <ResponsiveContainer minWidth={0} width="100%" height={500}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={100} outerRadius={200} paddingAngle={2} label>
                  {categoryData.map((_, i) => <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />)}
                </Pie>
                <Tooltip content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { name: string; value: number; count: number; units: number } | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl px-3 py-2 text-xs">
                      <p className="font-bold capitalize">{d.name}</p>
                      <p className="text-[var(--text-secondary)]">Valor: {formatCurrency(d.value, { decimals: 0 })}</p>
                      <p className="text-[var(--text-secondary)]">{d.count} productos | {d.units} unidades</p>
                    </div>
                  );
                }} />
              </PieChart>
            </ResponsiveContainer>
        </ChartExpandModal>
      )}
    </div>
  );
}

export default function InventarioAlmacenesModule() {
  const [sub, setSub] = useState(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return (localStorage.getItem(`admin-last-tab-${MODULE_ID}`) as typeof TABS[number]["id"]) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);
  const [conteoMode, setConteoMode] = useState<"wizard" | "manual" | "scanner">("wizard");
  const [showConteoModal, setShowConteoModal] = useState(false);
  const [showDeclaracionModal, setShowDeclaracionModal] = useState(false);

  // Auto-refresh: increment key to force child remount/re-fetch
  const [refreshKey, setRefreshKey] = useState(0);
  const { paused, togglePause, secondsLeft, refreshNow, isActive } = useAutoRefresh({
    intervalSeconds: 300,
    onRefresh: () => setRefreshKey(k => k + 1),
    enabled: sub === "stock",
  });

  const [forecastProductId, setForecastProductId] = useState<number | null>(null);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showPriceLabels, setShowPriceLabels] = useState(false);
  const [labelProducts, setLabelProducts] = useState<{ id: number; name: string; price: number; barcode?: string | null }[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<number>>(new Set());
  const [labelLoading, setLabelLoading] = useState(false);

  const loadLabelProducts = useCallback(async () => {
    setLabelLoading(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (Array.isArray(data)) setLabelProducts(data.filter((p: { active: boolean }) => p.active));
    } catch { /* ignore */ }
    setLabelLoading(false);
  }, []);

  const toggleLabelId = (id: number) => {
    setSelectedLabelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePrintLabels = () => {
    const selected = labelProducts.filter(p => selectedLabelIds.has(p.id));
    if (selected.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const labelsHtml = selected.map(p => `
      <div class="label">
        <div class="label-name">${p.name}</div>
        <div class="label-price">S/ ${Number(p.price).toFixed(2)}</div>
        ${p.barcode ? `<div class="label-barcode">${p.barcode}</div>` : ""}
      </div>
    `).join("");
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Etiquetas de Precio</title><style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
      .label { width: 60mm; height: 40mm; border: 1px dashed #ccc; padding: 3mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-inside: avoid; }
      .label-name { font-weight: bold; font-size: 14px; margin-bottom: 4px; overflow: hidden; max-height: 2.4em; line-height: 1.2em; }
      .label-price { font-weight: bold; font-size: 18px; color: var(--color-primary); }
      .label-barcode { font-family: monospace; font-size: 10px; color: #666; margin-top: 4px; }
    </style></head><body><div class="grid">${labelsHtml}</div><script>window.print();window.onafterprint=()=>window.close();</script></body></html>`);
    printWindow.document.close();
  };



  // Exposed for InventoryTab: open forecast for a product
  // This is set via a global callback so InventoryTab can trigger it
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__openForecast = (productId: number) => {
      setForecastProductId(productId);
    };
    (window as unknown as Record<string, unknown>).__openBarcodeScanner = () => {
      setShowBarcode(true);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__openForecast;
      delete (window as unknown as Record<string, unknown>).__openBarcodeScanner;
    };
  }, []);

  return (
    <div className="space-y-3 sm:space-y-6">
      <AdminModuleHeader
        title="Inventario"
        description="Stock, movimientos, vencimientos y análisis"
        icon={Package}
        bgTint="bg-amber-50 dark:bg-amber-900/20"
        iconColorClass="text-[var(--data-warning-600)] dark:text-amber-400"
      >
        {sub === "stock" && (
          <AutoRefreshControl
            secondsLeft={secondsLeft}
            paused={paused}
            isActive={isActive}
            onTogglePause={togglePause}
            onRefreshNow={refreshNow}
          />
        )}
        {/* Mejora 7: Price labels button */}
        <button
          onClick={() => { setShowPriceLabels(true); void loadLabelProducts(); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-alt)] transition-colors"
        >
          Imprimir etiquetas
        </button>
      </AdminModuleHeader>



      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={(id) => setSub(id as typeof sub)}
        moduleId="inventario"
      >

      {/* Tab 1: Existencias — Conteo físico y Declaración viven dentro del
          menú "Más acciones" de InventoryTab (se pasan como headerActions). */}
      {sub === "stock" && (
        <div key={refreshKey} className="space-y-6">
          <InventoryTab
            headerActions={[
              {
                label: "Conteo físico",
                icon: ListChecks,
                onClick: () => setShowConteoModal(true),
                description: "Contar y conciliar el stock real",
              },
              {
                label: "Generar declaración",
                icon: LayoutDashboard,
                onClick: () => setShowDeclaracionModal(true),
                description: "Declaración jurada de inventario",
              },
            ]}
          />
        </div>
      )}

      {/* Tab 2: Entradas y Salidas (simplificado) */}
      {sub === "kardex" && <SimpleMovementsTab />}

      {/* Tab 3: Vencimientos (simplificado) */}
      {sub === "lotes" && <SimpleExpiryTab />}

      </AdminTabBar>

      {/* ── Modal: Conteo Físico ── */}
      {showConteoModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowConteoModal(false)}>
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-4xl sm:rounded-xl rounded-t-2xl overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] sticky top-0 bg-[var(--surface-raised)] z-10">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Conteo Físico</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <button onClick={() => setConteoMode("wizard")} className={cn("px-3 py-1 rounded-lg text-xs font-medium", conteoMode === "wizard" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Guiado</button>
                  <button onClick={() => setConteoMode("manual")} className={cn("px-3 py-1 rounded-lg text-xs font-medium", conteoMode === "manual" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Manual</button>
                  <button onClick={() => setConteoMode("scanner")} className={cn("px-3 py-1 rounded-lg text-xs font-medium", conteoMode === "scanner" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Escáner</button>
                </div>
                <button onClick={() => setShowConteoModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
                  <XIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {conteoMode === "wizard" && <ConteoFisicoWizard />}
              {conteoMode === "manual" && <PhysicalCountTab />}
              {conteoMode === "scanner" && <QuickStockCounter />}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Declaración de Inventario ── */}
      {showDeclaracionModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowDeclaracionModal(false)}>
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-5xl sm:rounded-xl rounded-t-2xl overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] sticky top-0 bg-[var(--surface-raised)] z-10">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Declaración de Inventario</CardTitle>
              <button onClick={() => setShowDeclaracionModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
                <XIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <DeclaracionInventarioModule />
            </div>
          </div>
        </div>
      )}

      {/* ── Demand Forecast Modal ── */}
      {forecastProductId !== null && (
        <div className="modal-backdrop p-4">
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <DemandForecast
              productId={forecastProductId}
              onClose={() => setForecastProductId(null)}
            />
          </div>
        </div>
      )}

      {/* ── Barcode Scanner overlay ── */}
      {showBarcode && (
        <BarcodeScanner
          onScan={(code: string) => {
            setShowBarcode(false);
            if (process.env.NODE_ENV === "development") console.log("[BarcodeScanner] scanned:", code);
          }}
          onClose={() => setShowBarcode(false)}
        />
      )}

      {/* ── Mejora 7: Price Labels Modal ── */}
      {showPriceLabels && (
        <div className="modal-backdrop p-4" onClick={() => setShowPriceLabels(false)}>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <CardTitle className="font-bold text-[var(--text-primary)] text-sm">Imprimir Etiquetas de Precio</CardTitle>
              <button onClick={() => setShowPriceLabels(false)} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
                <span className="text-[var(--text-tertiary)] text-lg">&times;</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {labelLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => {
                        if (selectedLabelIds.size === labelProducts.length) setSelectedLabelIds(new Set());
                        else setSelectedLabelIds(new Set(labelProducts.map(p => p.id)));
                      }}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      {selectedLabelIds.size === labelProducts.length ? "Deseleccionar todos" : "Seleccionar todos"}
                    </button>
                    <span className="text-xs text-[var(--text-tertiary)]">{selectedLabelIds.size} seleccionados</span>
                  </div>
                  {labelProducts.map(p => (
                    <label key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--surface-alt)] cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedLabelIds.has(p.id)}
                        onChange={() => toggleLabelId(p.id)}
                        className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                      />
                      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{p.name}</span>
                      <span className="text-sm font-bold text-[var(--color-primary)]" style={{ color: "var(--color-primary)" }}>S/{Number(p.price).toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)]">
              <button onClick={handlePrintLabels} disabled={selectedLabelIds.size === 0} className="w-full py-2.5 rounded-lg text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--color-primary)]" style={{ backgroundColor: "var(--color-primary)" }}>
                Generar etiquetas ({selectedLabelIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
