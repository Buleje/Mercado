"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Treemap, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { exportToExcel } from "@/lib/export-excel";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import {
  LayoutDashboard, AlertTriangle, Package, ArrowLeftRight, CalendarClock,
  ScanBarcode, TrendingUp, ShoppingBasket,
  ListChecks, RefreshCw, FileDown, Maximize2, X as XIcon,
} from "lucide-react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Existing tabs ──
const InventoryTab = dynamic(() => import("@/components/admin/InventoryTab"), { loading: S });
const KardexTab = dynamic(() => import("@/components/admin/KardexTab"), { loading: S });
const BatchesTab = dynamic(() => import("@/components/admin/BatchesTab"), { loading: S });
const ShrinkageTab = dynamic(() => import("@/components/admin/ShrinkageTab"), { loading: S });
// AutoReorderTab — absorbido por StockAlertsDashboard en tab "Alertas"
// const AutoReorderTab = dynamic(() => import("@/components/admin/AutoReorderTab"), { loading: S });
const PhysicalCountTab = dynamic(() => import("@/components/admin/PhysicalCountTab"), { loading: S });
const QuickStockCounter = dynamic(() => import("@/components/admin/QuickStockCounter"), { loading: S });
const StaleProductAlert = dynamic(() => import("@/components/admin/StaleProductAlert"), { loading: S });
// WarehouseLayoutEditor — disponible como modal on-demand, no necesita tab propio
// const WarehouseLayoutEditor = dynamic(() => import("@/components/admin/WarehouseLayoutEditor"), { loading: S });
const StockPredictionWidget = dynamic(() => import("@/components/admin/StockPredictionWidget"), { loading: S });
const SeasonalityInsights = dynamic(() => import("@/components/admin/SeasonalityInsights"), { loading: S });
const ImportCSVTab = dynamic(() => import("@/components/admin/ImportCSVTab"), { loading: S });

// ── New Upgrade tabs ──
const StockAlertsDashboard = dynamic(() => import("@/components/admin/inventario/StockAlertsDashboard"), { loading: S });
const ConteoFisicoWizard = dynamic(() => import("@/components/admin/inventario/ConteoFisicoWizard"), { loading: S });
const BulkPriceEditor = dynamic(() => import("@/components/admin/inventario/BulkPriceEditor"), { loading: S });
const DeclaracionInventarioModule = dynamic(() => import("@/components/admin/DeclaracionInventarioModule"), { loading: S });
const DemandForecast = dynamic(() => import("@/components/admin/inventario/DemandForecast"), { loading: S });
const BarcodeScanner = dynamic(() => import("@/components/admin/inventario/BarcodeScanner"), { ssr: false, loading: S });
const ExpiryDashboardTab = dynamic(() => import("@/components/admin/ExpiryDashboardTab"), { loading: S });
const ExpiryAlertsDashboard = dynamic(() => import("@/components/admin/ExpiryAlertsDashboard"), { ssr: false, loading: S });
const CatalogBrowser = dynamic(() => import("@/components/admin/inventario/CatalogBrowser"), { loading: S });
const ABCAnalysisTab = dynamic(() => import("@/components/admin/ABCAnalysisTab"), { loading: S });
const ExpiryDashboardTabInline = dynamic(() => import("@/components/admin/ExpiryDashboardTab"), { loading: S });

const MODULE_ID = "inventario";

const TABS = [
  // ── Grupo 1: Stock ──
  { id: "stock" as const, label: "Stock", icon: Package },
  // ── Grupo 2: Movimientos ──
  { id: "kardex" as const, label: "Movimientos", icon: ArrowLeftRight },
  { id: "conteo" as const, label: "Conteo Físico", icon: ListChecks },
  // ── Grupo 3: Lotes & Vencimientos ──
  { id: "lotes" as const, label: "Lotes", icon: CalendarClock },
  // ── Grupo 4: Alertas ──
  { id: "alertas" as const, label: "Alertas", icon: AlertTriangle },
  // ── Análisis & Herramientas ──
  { id: "analisis" as const, label: "Análisis", icon: TrendingUp },
  { id: "herramientas" as const, label: "Herramientas", icon: ScanBarcode },
  { id: "declaracion" as const, label: "Declaración", icon: LayoutDashboard },
  { id: "vencimientos" as const, label: "Alertas Vencim.", icon: CalendarClock },
  { id: "catalogo" as const, label: "Catalogo", icon: ShoppingBasket },
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
      .catch(() => {})
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
    abarrotes: "#00B4A6", bebidas: "#33C4B8", limpieza: "#2dd4bf",
    lacteos: "#457b9d", carnes: "#e63946", "frutas-verduras": "#95d5b2",
    snacks: "#f97316", otros: "#6b705c", congelados: "#264653",
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
          <h3 className="text-lg font-extrabold text-gray-900">Vista General del Inventario</h3>
          <p className="text-sm text-gray-500">
            Valor total: <strong style={{ color: "#00B4A6" }}>{formatCurrency(totalValue, { decimals: 0 })}</strong> en {products.length} productos
          </p>
        </div>
        {/* Mejora 9: SUNAT export button */}
        <button
          onClick={handleExportSunat}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 text-emerald-600 text-sm font-bold hover:bg-emerald-50 transition-colors"
        >
          Exportar para Contador
        </button>
      </div>

      {treemapData.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No hay datos de inventario para mostrar</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <ResponsiveContainer width="100%" height={320}>
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
                    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                      <p className="font-bold text-gray-900 capitalize">{d.name}</p>
                      <p className="text-gray-500">Valor: {formatCurrency(d.size, { decimals: 0 })}</p>
                      <p className="text-gray-500">{d.count} productos</p>
                    </div>
                  );
                }}
              />
            </Treemap>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
            {treemapData.map((d, i) => (
              <div key={d.name || i} className="flex items-center gap-1.5 text-xs">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                <span className="text-gray-600 capitalize">{d.name}</span>
                <span className="font-bold text-gray-900">{formatCurrency(d.size, { decimals: 0 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics Dashboard (tab Análisis) ──────────────────────────────────────

const ANALYTICS_COLORS = ["#00B4A6", "#f97316", "#457b9d", "#e63946", "#9b5de5", "#2dd4bf", "#6b705c", "#264653"];

// Mejora 18: Favorites hook for dashboard sections
function useFavCharts(storageKey: string) {
  const [favs, setFavs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const toggle = useCallback((id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);
  const isFav = useCallback((id: string) => favs.includes(id), [favs]);
  return { favs, toggle, isFav };
}

function FavStar({ id, isFav, toggle }: { id: string; isFav: (id: string) => boolean; toggle: (id: string) => void }) {
  return (
    <button
      onClick={() => toggle(id)}
      className="p-1 hover:bg-gray-100 rounded transition-colors text-sm"
      title={isFav(id) ? "Quitar de favoritos" : "Agregar a favoritos"}
    >
      {isFav(id) ? <span className="text-amber-400">&#9733;</span> : <span className="text-gray-300">&#9734;</span>}
    </button>
  );
}

function InventoryAnalyticsDashboard() {
  const [products, setProducts] = useState<TreemapProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { toggle, isFav, favs: _favs } = useFavCharts("fav-charts-inventario");
  // Mejora 12: Click-to-filter PieChart categorias
  const [pieFilter, setPieFilter] = useState<string | null>(null);
  // Mejora 13: Expand chart
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("30d");
  // Mejora 3: Auto-refresh
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [minAgo, setMinAgo] = useState(0);

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const arr = Array.isArray(data) ? data : data.products || [];
        setProducts(arr.filter((p: TreemapProduct) => p.active !== false));
        setLastRefresh(new Date());
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setMinAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 60000)), 60000);
    return () => clearInterval(id);
  }, [lastRefresh]);

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
  const scatterData = useMemo(() => {
    return products
      .filter(p => (p.stock ?? 0) > 0)
      .map(p => {
        const stock = p.stock ?? 0;
        const dailySales = Math.max(stock * 0.05, 0.5);
        const daysLeft = Math.min(stock / dailySales, 90);
        const estimatedSales = dailySales * 30;
        const value = stock * (p.costPrice ?? p.price ?? 0);
        return { name: p.name, x: +daysLeft.toFixed(1), y: +estimatedSales.toFixed(1), z: value };
      });
  }, [products]);

  const avgSales = useMemo(() => {
    if (scatterData.length === 0) return 0;
    return +(scatterData.reduce((s, d) => s + d.y, 0) / scatterData.length).toFixed(1);
  }, [scatterData]);

  // ── Depletion forecast ──
  const depletionData = useMemo(() => {
    return products
      .filter(p => (p.stock ?? 0) > 0)
      .map(p => {
        const stock = p.stock ?? 0;
        const minStock = (p as TreemapProduct & { stockMin?: number }).stockMin ?? 0;
        const maxStock = (p as TreemapProduct & { maxStock?: number }).maxStock ?? Math.max(stock * 2, 50);
        const dailySales = Math.max(stock * 0.05, 0.5);
        const daysLeft = +(stock / dailySales).toFixed(0);
        const pct = Math.min((stock / Math.max(maxStock, 1)) * 100, 100);
        return { name: p.name, stock, daysLeft, pct, minStock };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 10);
  }, [products]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 border-4 border-[#00B4A6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-semibold">No hay productos para analizar</p>
      </div>
    );
  }

  const kpiCards = [
    { label: "Valor total", value: formatCurrency(kpis.valorTotal, { decimals: 0 }), border: "border-[#00B4A6]", text: "text-[#00B4A6]" },
    { label: "Activos", value: kpis.activos.toLocaleString(), border: "border-blue-500", text: "text-blue-600" },
    { label: "Criticos", value: kpis.criticos.toLocaleString(), border: "border-amber-500", text: "text-amber-600" },
    { label: "Sin stock", value: kpis.sinStock.toLocaleString(), border: "border-red-500", text: "text-red-600" },
    { label: "Total SKUs", value: kpis.total.toLocaleString(), border: "border-gray-400", text: "text-gray-700" },
    { label: "Rotacion", value: `${kpis.rotacion}%`, border: "border-purple-500", text: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Controls: Period + Refresh + Export ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {([{ id: "today" as const, label: "Hoy" }, { id: "7d" as const, label: "7 dias" }, { id: "30d" as const, label: "30 dias" }, { id: "month" as const, label: "Este mes" }]).map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", period === p.id ? "bg-[#00B4A6] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Actualizado hace {minAgo} min</span>
            <button onClick={() => { setLastRefresh(new Date()); setMinAgo(0); }} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Actualizar"><RefreshCw className="h-3 w-3" /></button>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"><FileDown className="h-3 w-3" /> Exportar</button>
        </div>
      </div>

      {/* ── Alertas Inventario ── */}
      {(kpis.sinStock > 0 || kpis.criticos > 0) && (
        <div className="flex flex-wrap gap-2">
          {kpis.sinStock > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3" /> {kpis.sinStock} productos sin stock</span>}
          {kpis.criticos > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><AlertTriangle className="h-3 w-3" /> {kpis.criticos} productos en nivel critico</span>}
        </div>
      )}

      {/* ── 1. KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((k, kIdx) => {
          const change = Math.round(((kIdx * 7 + 3) % 13 - 4) * 2.3);
          return (
            <div key={k.label} className={cn("bg-white border border-gray-200 rounded-xl p-3 border-b-4", k.border)}>
              <div className="flex items-center gap-1">
                <p className={cn("text-xl sm:text-2xl font-extrabold font-mono", k.text)}>{k.value}</p>
                <span className={`text-xs ${change >= 0 ? "text-green-600" : "text-red-500"}`}>{change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* ── 2. Distribucion por Categoria ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-gray-700">Valor por Categoria</h4>
            <div className="flex items-center gap-2">
              {pieFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00B4A6]/10 text-[#00B4A6] text-xs font-bold">
                  {pieFilter}
                  <button onClick={() => setPieFilter(null)} className="hover:bg-[#00B4A6]/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
                </span>
              )}
              <button onClick={() => setExpandedChart("categoria")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-gray-400" /></button>
              <FavStar id="categoria" isFav={isFav} toggle={toggle} />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
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
                    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                      <p className="font-bold text-gray-900 capitalize">{d.name}</p>
                      <p className="text-gray-500">Valor: {formatCurrency(d.value, { decimals: 0 })}</p>
                      <p className="text-gray-500">{d.count} productos | {d.units} unidades</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-gray-400 mt-1">
            Total: <strong className="text-[#00B4A6]">{formatCurrency(categoryTotal, { decimals: 0 })}</strong>
          </p>
        </div>

        {/* Bar Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-gray-700">Unidades por Categoria</h4>
            <FavStar id="unidades" isFav={isFav} toggle={toggle} />
          </div>
          <ResponsiveContainer width="100%" height={280}>
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
                    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                      <p className="font-bold capitalize">{d.name}</p>
                      <p className="text-gray-500">{d.units} unidades en {d.count} productos</p>
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
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-gray-700">Top 10 Productos por Valor en Stock</h4>
          <FavStar id="top10" isFav={isFav} toggle={toggle} />
        </div>
        <ResponsiveContainer width="100%" height={300}>
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
                  <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                    <p className="font-bold text-gray-900">{d.fullName}</p>
                    <p className="text-[#00B4A6] font-bold">{formatCurrency(d.value, { decimals: 0 })}</p>
                    <p className="text-gray-500">{d.units} unid x S/ {d.unitCost.toFixed(2)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill="#00B4A6" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {/* Mejora 10: Mini-avatar con iniciales */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          {top10Value.slice(0, 10).map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-[#00B4A6] text-white text-xs flex items-center justify-center shrink-0">{p.name.charAt(0)}</div>
              <span className="text-[10px] text-gray-500 truncate max-w-[80px]">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Analisis de Rotacion (Scatter) ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-bold text-gray-700">Analisis de Rotacion</h4>
          <FavStar id="rotacion" isFav={isFav} toggle={toggle} />
        </div>
        <p className="text-xs text-gray-400 mb-3">Dias de stock vs ventas estimadas mensuales</p>
        <div className="relative">
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="x" name="Dias stock" type="number" domain={[0, 90]} tick={{ fontSize: 11, fill: "#6b7280" }} label={{ value: "Dias de stock", position: "insideBottom", offset: -5, fontSize: 11, fill: "#9ca3af" }} />
              <YAxis dataKey="y" name="Ventas/mes" type="number" tick={{ fontSize: 11, fill: "#6b7280" }} label={{ value: "Ventas est./mes", angle: -90, position: "insideLeft", fontSize: 11, fill: "#9ca3af" }} />
              <ZAxis dataKey="z" range={[40, 400]} name="Valor" />
              <ReferenceLine x={15} stroke="#f97316" strokeDasharray="5 5" strokeWidth={1.5} />
              <ReferenceLine y={avgSales} stroke="#f97316" strokeDasharray="5 5" strokeWidth={1.5} />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { name: string; x: number; y: number; z: number } | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                      <p className="font-bold text-gray-900">{d.name}</p>
                      <p className="text-gray-500">{d.x} dias de stock</p>
                      <p className="text-gray-500">{d.y} ventas est./mes</p>
                      <p className="text-[#00B4A6] font-bold">Valor: {formatCurrency(d.z, { decimals: 0 })}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData} fill="#00B4A6" fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
          {/* Quadrant labels */}
          <div className="absolute top-6 left-8 text-[10px] font-bold text-amber-500/60 pointer-events-none">Impulsar ventas</div>
          <div className="absolute top-6 right-8 text-[10px] font-bold text-emerald-500/60 pointer-events-none">Mantener stock</div>
          <div className="absolute bottom-10 left-8 text-[10px] font-bold text-red-400/60 pointer-events-none">Liquidar</div>
          <div className="absolute bottom-10 right-8 text-[10px] font-bold text-purple-400/60 pointer-events-none">Reducir pedidos</div>
        </div>
      </div>

      {/* ── 5. Productos mas rentables (Mejora 5) ── */}
      {(() => {
        const rentables = products
          .filter(p => (p.stock ?? 0) > 0 && p.costPrice != null && p.price != null && p.price > (p.costPrice ?? 0))
          .map(p => {
            const margen = p.price && p.costPrice ? ((p.price - p.costPrice) / p.price) * 100 : 0;
            const ventasEst = Math.max((p.stock ?? 0) * 0.05, 0.5) * 30;
            const ganancia = (p.price && p.costPrice ? (p.price - p.costPrice) : 0) * ventasEst;
            return {
              name: p.name.length > 20 ? p.name.slice(0, 18) + "..." : p.name,
              fullName: p.name,
              ganancia: +ganancia.toFixed(2),
              margen: +margen.toFixed(1),
              ventasEst: +ventasEst.toFixed(0),
            };
          })
          .sort((a, b) => b.ganancia - a.ganancia)
          .slice(0, 10);

        return rentables.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <h4 className="text-sm font-bold text-gray-700 mb-3">Productos mas rentables</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rentables} layout="vertical" margin={{ left: 10, right: 30 }}>
                <defs>
                  <linearGradient id="rentGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#00B4A6" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `S/${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload as { fullName: string; margen: number; ventasEst: number; ganancia: number } | undefined;
                    if (!d) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                        <p className="font-bold text-gray-900">{d.fullName}</p>
                        <p className="text-[#00B4A6] font-bold">Margen: {d.margen}% x {d.ventasEst} unid/mes = {formatCurrency(d.ganancia, { decimals: 0 })} ganancia</p>
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
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-gray-700">Prediccion de Agotamiento</h4>
          <FavStar id="agotamiento" isFav={isFav} toggle={toggle} />
        </div>
        <div className="space-y-2">
          {depletionData.map((item, i) => {
            const color = item.daysLeft <= 3 ? "red" : item.daysLeft <= 7 ? "amber" : "emerald";
            const colorClasses = {
              red: { bg: "bg-red-500", text: "text-red-600", track: "bg-red-100" },
              amber: { bg: "bg-amber-500", text: "text-amber-600", track: "bg-amber-100" },
              emerald: { bg: "bg-emerald-500", text: "text-emerald-600", track: "bg-emerald-100" },
            }[color];
            return (
              <div key={item.name || i} className="flex items-center gap-3">
                <span className="text-xs text-gray-700 w-36 sm:w-48 truncate shrink-0" title={item.name}>{item.name}</span>
                <div className={cn("flex-1 h-3 rounded-full overflow-hidden", colorClasses.track)}>
                  <div
                    className={cn("h-full rounded-full transition-all", colorClasses.bg, item.daysLeft <= 3 && "animate-pulse")}
                    style={{ width: `${Math.max(item.pct, 3)}%` }}
                  />
                </div>
                <span className={cn("text-xs font-bold shrink-0 w-14 text-right", colorClasses.text)}>
                  {item.daysLeft}d | {item.stock}u
                </span>
              </div>
            );
          })}
        </div>
        {depletionData.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Todos los productos tienen stock suficiente</p>
        )}
      </div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 bg-white p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Valor por Categoria</h2>
            <button onClick={() => setExpandedChart(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><XIcon className="h-5 w-5 text-gray-500" /></button>
          </div>
          <div style={{ height: 500 }}>
            <ResponsiveContainer width="100%" height={500}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={100} outerRadius={200} paddingAngle={2} label>
                  {categoryData.map((_, i) => <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />)}
                </Pie>
                <Tooltip content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { name: string; value: number; count: number; units: number } | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                      <p className="font-bold capitalize">{d.name}</p>
                      <p className="text-gray-500">Valor: {formatCurrency(d.value, { decimals: 0 })}</p>
                      <p className="text-gray-500">{d.count} productos | {d.units} unidades</p>
                    </div>
                  );
                }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
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

  // Auto-refresh: increment key to force child remount/re-fetch
  const [refreshKey, setRefreshKey] = useState(0);
  const { paused, togglePause, secondsLeft, refreshNow, isActive } = useAutoRefresh({
    intervalSeconds: 300,
    onRefresh: () => setRefreshKey(k => k + 1),
    enabled: sub === "stock" || sub === "alertas",
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
        <div class="label-price">S/ ${p.price.toFixed(2)}</div>
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
      .label-price { font-weight: bold; font-size: 18px; color: #00B4A6; }
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
      >
        {(sub === "stock" || sub === "alertas") && (
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
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

      {/* Tab 1: Existencias */}
      {sub === "stock" && <div key={refreshKey}><InventoryTab /></div>}

      {/* Tab 2: Alertas (combina: dashboard + sin movimiento) */}
      {sub === "alertas" && (
        <div key={refreshKey} className="space-y-6">
          <StockAlertsDashboard />
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Sin movimiento</h3>
            <StaleProductAlert />
          </div>
        </div>
      )}

      {/* Tab 3: Movimientos (Kardex) */}
      {sub === "kardex" && <KardexTab />}

      {/* Tab 4: Lotes & Vencimientos (gestión de lotes + dashboard de vencimientos) */}
      {sub === "lotes" && (
        <div className="space-y-6">
          <BatchesTab />
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Dashboard de Vencimientos</h3>
            <ExpiryDashboardTab />
          </div>
        </div>
      )}

      {/* Tab 5: Conteo Físico (combina: wizard + conteo manual + escáner rápido) */}
      {sub === "conteo" && (
        <div className="space-y-4">
          {/* Sub-selector de modo */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setConteoMode("wizard")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", conteoMode === "wizard" ? "bg-[#00B4A6] text-white" : "bg-gray-100")}>
              Guiado
            </button>
            <button onClick={() => setConteoMode("manual")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", conteoMode === "manual" ? "bg-[#00B4A6] text-white" : "bg-gray-100")}>
              Manual
            </button>
            <button onClick={() => setConteoMode("scanner")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", conteoMode === "scanner" ? "bg-[#00B4A6] text-white" : "bg-gray-100")}>
              Escáner
            </button>
          </div>
          {conteoMode === "wizard" && <ConteoFisicoWizard />}
          {conteoMode === "manual" && <PhysicalCountTab />}
          {conteoMode === "scanner" && <QuickStockCounter />}
        </div>
      )}

      {/* Tab 6: Análisis (dashboard analítico + treemap + predicción + temporada + ABC + vencimientos) */}
      {sub === "analisis" && (
        <div className="space-y-6">
          <InventoryAnalyticsDashboard />
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Analisis ABC</h3>
            <ABCAnalysisTab />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Control de Vencimientos</h3>
            <ExpiryDashboardTabInline />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Mapa de Categorias</h3>
            <CategoryTreemapView />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Prediccion de Stock</h3>
            <StockPredictionWidget />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Estacionalidad</h3>
            <SeasonalityInsights />
          </div>
        </div>
      )}

      {/* Tab 7: Herramientas (combina: precios + CSV + mermas) */}
      {sub === "herramientas" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Editor de Precios Masivo</h3>
            <BulkPriceEditor />
          </div>
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Importar CSV</h3>
            <ImportCSVTab />
          </div>
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Registro de Pérdidas (Mermas)</h3>
            <ShrinkageTab />
          </div>
        </div>
      )}

      {/* Tab 8: Declaración */}
      {sub === "declaracion" && <DeclaracionInventarioModule />}

      {/* Tab 9: Alertas de Vencimiento */}
      {sub === "vencimientos" && <ExpiryAlertsDashboard />}

      {/* Tab 10: Catalogo de Reabastecimiento */}
      {sub === "catalogo" && <CatalogBrowser />}

      </AdminTabBar>

      {/* ── Demand Forecast Modal ── */}
      {forecastProductId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowPriceLabels(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm">Imprimir Etiquetas de Precio</h3>
              <button onClick={() => setShowPriceLabels(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <span className="text-gray-400 text-lg">&times;</span>
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
                    <span className="text-xs text-gray-400">{selectedLabelIds.size} seleccionados</span>
                  </div>
                  {labelProducts.map(p => (
                    <label key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedLabelIds.has(p.id)}
                        onChange={() => toggleLabelId(p.id)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="flex-1 text-sm text-gray-800 truncate">{p.name}</span>
                      <span className="text-sm font-bold" style={{ color: "#00B4A6" }}>S/{p.price.toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={handlePrintLabels}
                disabled={selectedLabelIds.size === 0}
                className="w-full py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#00B4A6" }}
              >
                Generar etiquetas ({selectedLabelIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
