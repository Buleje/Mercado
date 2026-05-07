"use client";
import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Tag, Package, PackageCheck, PackageX,
  DollarSign, TrendingUp, Layers, ImageOff, Calculator, AlertTriangle,
  Camera, Eye, Maximize2, X as XIcon,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import FavStar from "@/components/admin/shared/FavStar";
import ChartExpandModal from "@/components/admin/shared/ChartExpandModal";
import DashboardSkeleton from "@/components/admin/shared/DashboardSkeleton";
import KpiCard from "@/components/admin/shared/KPICard";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import ExportButton from "@/components/admin/shared/ExportButton";
import PeriodSelector from "@/components/admin/shared/PeriodSelector";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, RadialBarChart, RadialBar,
  ComposedChart, Line, ScatterChart, Scatter, ZAxis,
  CartesianGrid, ReferenceLine,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const CategoriesEditorTab = dynamic(() => import("@/components/admin/CategoriesEditorTab"), { loading: S });
const PromotionsTab      = dynamic(() => import("@/components/admin/PromotionsTab"),      { loading: S });
const CouponsTab         = dynamic(() => import("@/components/admin/CouponsTab"),         { loading: S });
const PriceHistoryTab    = dynamic(() => import("@/components/admin/PriceHistoryTab"),    { loading: S });

const MODULE_ID = "catalogo-tienda";

const TABS: AdminTab[] = [
  { id: "categorias",        label: "Categorías",        icon: Tag },
  { id: "promociones",       label: "Ofertas",           icon: Tag },
  { id: "cupones",           label: "Cupones",           icon: Tag },
  { id: "historial-precios", label: "Historial precios", icon: Tag },
];

// ── Colores y tooltip compartidos ──────────────────────────────────────────

const CHART_COLORS = ['var(--color-primary)', '#f97316', '#457b9d', '#e63946', '#9b5de5', '#2dd4bf', '#264653', '#6b705c'];

type LocalChartTooltipProps = Partial<TooltipContentProps<ValueType, NameType>>;

function ChartTooltip({ active, payload, label }: LocalChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 bg-white rounded-xl border border-[var(--rule-soft)] px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">{String(label ?? "")}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs flex justify-between gap-4">
          <span className="text-[var(--text-secondary)]">{String(p.name ?? (typeof p.dataKey === "string" || typeof p.dataKey === "number" ? p.dataKey : ""))}</span>
          <span className="font-mono font-medium" style={{ color: p.color }}>
            {typeof p.value === 'number' ? (p.value > 100 ? `S/ ${p.value.toLocaleString()}` : Number(p.value).toFixed(1)) : String(p.value ?? "")}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Dashboard de Productos ──────────────────────────────────────────────────



// ── Tipo de producto (desde /api/products) ─────────────────────────────────
interface ProductRecord {
  id?: string | number;
  name?: string;
  price?: number;
  cost?: number;
  costPrice?: number;
  stock?: number;
  categoryId?: string | number;
  category?: string | { name?: string };
  categoryName?: string;
  imageUrl?: string;
  image?: string;
  minStock?: number;
  status?: string;
  active?: boolean;
}

function ProductsDashboard() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Mejora 12: Click-to-filter PieChart categorias
  const [pieFilter, setPieFilter] = useState<string | null>(null);
  // Mejora 13: Expand chart
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("30d");
  // Mejora 3: Auto-refresh
  // Mock KPI deltas — lazy-init so Math.random runs once per mount (React Compiler purity rule)
  const [kpiMockChanges] = useState<number[]>(() =>
    Array.from({ length: 8 }, () => Math.round((Math.random() - 0.3) * 30))
  );
  // Mejora 5: Favoritos
  const catFavs = useFavoriteCharts("catalogo");

  const fetchData = useCallback(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setProducts(Array.isArray(d) ? d : d.products || []); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const autoRefresh = useAutoRefresh({ intervalSeconds: 300, onRefresh: fetchData });

  // Helper: extrae nombre de categoria (string o objeto)
  const categoryName = (p: ProductRecord): string => {
    if (typeof p.category === "string") return p.category;
    if (p.category && typeof p.category === "object" && p.category.name) return p.category.name;
    return p.categoryName || "Otros";
  };

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const total = products.length;
    const conStock = products.filter((p) => (p.stock || 0) > 0).length;
    const sinStock = products.filter((p) => (p.stock || 0) === 0).length;
    const stockBajo = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock || 5)).length;
    const precioAvg = total > 0 ? products.reduce((s, p) => s + (p.price || 0), 0) / total : 0;
    const conCosto = products.filter((p) => (p.costPrice ?? 0) > 0);
    const margenAvg = conCosto.length > 0
      ? conCosto.reduce((s, p) => {
          const price = p.price || 0;
          const costPrice = p.costPrice || 0;
          return s + (price > 0 ? ((price - costPrice) / price) * 100 : 0);
        }, 0) / conCosto.length
      : 0;
    const cats = new Set(products.map((p) => categoryName(p))).size;
    const sinImagen = products.filter((p) => !p.image).length;
    const sinCosto = products.filter((p) => !p.costPrice || p.costPrice === 0).length;
    return { total, conStock, sinStock, stockBajo, precioAvg, margenAvg, cats, sinImagen, sinCosto };
  }, [products]);

  /* ── Datos por categoría ── */
  const categoryData = useMemo(() => {
    const g: Record<string, number> = {};
    products.forEach((p) => {
      const cat = categoryName(p);
      g[cat] = (g[cat] || 0) + 1;
    });
    return Object.entries(g).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [products]);

  /* ── Valor inventario por categoría ── */
  const inventoryByCat = useMemo(() => {
    const g: Record<string, number> = {};
    products.forEach((p) => {
      const cat = categoryName(p);
      g[cat] = (g[cat] || 0) + (p.stock || 0) * (p.costPrice || p.price || 0);
    });
    return Object.entries(g).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  }, [products]);

  const totalInventoryValue = useMemo(() => inventoryByCat.reduce((s, c) => s + c.value, 0), [inventoryByCat]);

  /* ── Radial data for category distribution ── */
  const radialData = useMemo(() => {
    return categoryData.slice(0, 7).map((c, i) => ({
      name: c.name,
      value: c.value,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [categoryData]);

  /* ── Histograma de precios ── */
  const priceHistogram = useMemo(() => {
    const ranges = [
      { label: "S/0-5", min: 0, max: 5 },
      { label: "S/5-10", min: 5, max: 10 },
      { label: "S/10-20", min: 10, max: 20 },
      { label: "S/20-50", min: 20, max: 50 },
      { label: "S/50-100", min: 50, max: 100 },
      { label: "S/100+", min: 100, max: Infinity },
    ];
    return ranges.map((r, i) => ({
      rango: r.label,
      count: products.filter((p) => (p.price || 0) >= r.min && (p.price || 0) < r.max).length,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [products]);

  /* ── Top 10 por valor en stock ── */
  const top10Stock = useMemo(() => {
    return [...products]
      .map((p) => {
        const price = p.price || 0;
        const costPrice = p.costPrice || 0;
        return {
          name: (p.name || "").substring(0, 22),
          valor: Math.round((p.stock || 0) * (costPrice || price)),
          margen: costPrice > 0 && price > 0 ? Math.round(((price - costPrice) / price) * 100) : 0,
        };
      })
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [products]);

  /* ── Scatter data (margen vs precio) ── */
  const scatterData = useMemo(() => {
    return products
      .filter((p) => (p.costPrice ?? 0) > 0 && (p.price ?? 0) > 0)
      .map((p) => {
        const price = p.price || 0;
        const costPrice = p.costPrice || 0;
        return {
          name: (p.name || "").substring(0, 25),
          precio: price,
          margen: price > 0 ? Math.round(((price - costPrice) / price) * 100) : 0,
          stock: p.stock || 1,
          costo: costPrice,
        };
      });
  }, [products]);

  /* ── Estado stock (gauge) ── */
  const stockGauge = useMemo(() => {
    return [
      { name: "Con stock", value: kpis.conStock - kpis.stockBajo, fill: "var(--color-primary)" },
      { name: "Stock bajo", value: kpis.stockBajo, fill: "#f97316" },
      { name: "Sin stock", value: kpis.sinStock, fill: "#e63946" },
    ].filter((s) => s.value > 0);
  }, [kpis]);

  /* ── Loading skeleton ── */
  if (loading) return <DashboardSkeleton kpis={8} />;

  const kpiCards = [
    { label: "Total SKUs", value: kpis.total, icon: Package, color: "var(--color-primary)", alert: false },
    { label: "Con stock", value: kpis.conStock, icon: PackageCheck, color: "#457b9d", alert: false },
    { label: "Sin stock", value: kpis.sinStock, icon: PackageX, color: "#e63946", alert: kpis.sinStock > 0 },
    { label: "Precio prom.", value: `S/ ${Number(kpis.precioAvg).toFixed(1)}`, icon: DollarSign, color: "#9b5de5", alert: false },
    { label: "Margen prom.", value: `${Number(kpis.margenAvg).toFixed(1)}%`, icon: TrendingUp, color: "#f97316", alert: kpis.margenAvg < 15 },
    { label: "Categorias", value: kpis.cats, icon: Layers, color: "#2dd4bf", alert: false },
    { label: "Sin imagen", value: kpis.sinImagen, icon: ImageOff, color: "#e63946", alert: kpis.sinImagen > 0 },
    { label: "Sin costo", value: kpis.sinCosto, icon: Calculator, color: "#6b705c", alert: kpis.sinCosto > 0 },
  ];

  return (
    <div className="space-y-6">

      {/* === Controls: Period + Refresh + Export === */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <AutoRefreshControl secondsLeft={autoRefresh.secondsLeft} paused={autoRefresh.paused} isActive={autoRefresh.isActive} onTogglePause={autoRefresh.togglePause} onRefreshNow={autoRefresh.refreshNow} />
          <ExportButton />
        </div>
      </div>

      {/* === SECCION 1: KPIs Premium === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((k, i) => (
          <KpiCard key={i} label={k.label} value={k.value} icon={k.icon} color={k.color} change={kpiMockChanges[i] ?? 0} alert={k.alert} />
        ))}
      </div>

      {/* === SECCION 2: Distribucion (RadialBarChart + PieChart inventario) === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
          <div className="flex items-center gap-2 mb-4"><FavStar id="distribucion-cat" favs={catFavs} /><CardTitle className="text-sm font-bold text-[var(--text-primary)]">Distribucion por categoria</CardTitle></div>
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={radialData} startAngle={180} endAngle={-180}>
              <RadialBar dataKey="value" background={{ fill: "rgba(0,0,0,0.05)" }} cornerRadius={6} />
              <Legend iconSize={10} formatter={(value) => <span className="text-xs text-[var(--text-secondary)]">{value}</span>} />
              <Tooltip content={<ChartTooltip />} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Valor del inventario por categoria</CardTitle>
            <div className="flex items-center gap-2">
              {pieFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {pieFilter}
                  <button onClick={() => setPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
                </span>
              )}
              <button onClick={() => setExpandedChart("inv-cat")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
            </div>
          </div>
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <PieChart>
              <Pie data={inventoryByCat.slice(0, 8)} innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2} className="cursor-pointer"
                label={({ name, percent }: { name?: string; percent?: number }) => `${(name || "").substring(0, 12)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                onClick={(_: unknown, idx: number) => setPieFilter(prev => prev === inventoryByCat[idx]?.name ? null : inventoryByCat[idx]?.name ?? null)}
              >
                {inventoryByCat.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              {/* Centro label */}
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" className="fill-gray-900 text-lg font-bold font-mono">
                S/ {totalInventoryValue.toLocaleString()}
              </text>
              <text x="50%" y="57%" textAnchor="middle" dominantBaseline="central" className="fill-gray-400 text-xs">
                Total inv.
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* === SECCION 3: Histograma de precios === */}
      <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Rango de precios</CardTitle>
        <ResponsiveContainer minWidth={0} width="100%" height={240}>
          <BarChart data={priceHistogram}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="rango" tick={{ fontSize: 11 }} className="fill-gray-500" />
            <YAxis tick={{ fontSize: 11 }} className="fill-gray-500" />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const total = products.length || 1;
              const rawVal = payload[0]?.value;
              const val = typeof rawVal === "number" ? rawVal : 0;
              return (
                <div className="bg-white rounded-xl border border-[var(--rule-soft)] px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{String(label ?? "")}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{val} productos ({((val / total) * 100).toFixed(0)}%)</p>
                </div>
              );
            }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Productos">
              {priceHistogram.map((entry, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === SECCION 4: Top 10 por valor en stock (ComposedChart) === */}
      <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Top 10 productos por valor en stock</CardTitle>
        <ResponsiveContainer minWidth={0} width="100%" height={300}>
          <ComposedChart data={top10Stock} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v.toLocaleString()}`} className="fill-gray-500" />
            <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} className="fill-gray-600" />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Bar dataKey="valor" fill="var(--color-primary)" radius={[0, 6, 6, 0]} name="Valor stock (S/)" barSize={16} />
            <Line dataKey="margen" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} name="Margen %" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* === SECCION 5: Scatter de margenes === */}
      <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-1">Análisis de margenes</CardTitle>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">Precio venta vs margen % — tamano = stock</p>
        <ResponsiveContainer minWidth={0} width="100%" height={300}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="precio" name="Precio" tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v}`} className="fill-gray-500" />
            <YAxis dataKey="margen" name="Margen %" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} className="fill-gray-500" />
            <ZAxis dataKey="stock" range={[30, 300]} name="Stock" />
            <ReferenceLine y={20} stroke="#f97316" strokeDasharray="6 3" label={{ value: "Objetivo 20%", position: "right", fontSize: 10, fill: "#f97316" }} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as
                | { name?: string; precio?: number; costo?: number; margen?: number; stock?: number }
                | undefined;
              if (!d) return null;
              const margen = d.margen ?? 0;
              return (
                <div className="min-w-45 bg-white rounded-xl border border-[var(--rule-soft)] px-4 py-3">
                  <p className="text-xs font-bold text-[var(--text-primary)] mb-1">{d.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">Precio: <span className="font-mono font-medium text-[var(--text-primary)]">S/ {d.precio?.toFixed(2)}</span></p>
                  <p className="text-xs text-[var(--text-secondary)]">Costo: <span className="font-mono font-medium text-[var(--text-primary)]">S/ {d.costo?.toFixed(2)}</span></p>
                  <p className="text-xs text-[var(--text-secondary)]">Margen: <span className={cn("font-mono font-medium", margen >= 25 ? "text-[var(--data-success-500)]" : margen >= 10 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>{margen}%</span></p>
                  <p className="text-xs text-[var(--text-secondary)]">Stock: <span className="font-mono font-medium text-[var(--text-primary)]">{d.stock}</span></p>
                </div>
              );
            }} />
            <Scatter data={scatterData} shape={(props: unknown) => {
              const p = props as { cx?: number; cy?: number; payload?: { margen?: number; stock?: number } };
              const { cx = 0, cy = 0, payload } = p;
              const m = payload?.margen ?? 0;
              const color = m >= 25 ? "var(--color-primary)" : m >= 10 ? "#f97316" : "#e63946";
              const r = Math.min(Math.max((payload?.stock || 1) * 0.4, 4), 14);
              return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.7} stroke={color} strokeWidth={1.5} />;
            }} />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> {">"}25% margen</span>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]" /> 10-25%</span>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)]" /> {"<"}10%</span>
        </div>
      </div>

      {/* === SECCION 6: Estado de stock (Gauge donut) === */}
      <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Productos por estado de stock</CardTitle>
        <ResponsiveContainer minWidth={0} width="100%" height={200}>
          <PieChart>
            <Pie data={stockGauge} innerRadius={55} outerRadius={80} startAngle={180} endAngle={0} dataKey="value" paddingAngle={2}>
              {stockGauge.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" formatter={(value) => <span className="text-xs text-[var(--text-secondary)]">{value}</span>} />
            <text x="50%" y="70%" textAnchor="middle" dominantBaseline="central" className="fill-gray-900 text-2xl font-bold font-mono">
              {kpis.total}
            </text>
            <text x="50%" y="82%" textAnchor="middle" dominantBaseline="central" className="fill-gray-400 text-xs">
              total
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* === SECCION 7: Alertas del catalogo === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.sinImagen > 0 && (
          <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-[var(--data-warning-100)] flex items-center justify-center shrink-0">
              <Camera className="h-5 w-5 text-[var(--data-warning-500)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--data-warning-500)]">{kpis.sinImagen} sin imagen</p>
              <p className="text-xs text-[var(--data-warning-500)] mt-0.5">Productos sin foto se venden menos</p>
              <button className="mt-2 text-xs font-semibold text-[var(--data-warning-500)] bg-[var(--data-warning-100)] px-3 py-1 rounded-full hover:bg-[var(--data-warning-500)] transition-colors">
                Completar
              </button>
            </div>
          </div>
        )}
        {kpis.sinCosto > 0 && (
          <div className="bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-[var(--data-error-100)] flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--data-error-500)]">{kpis.sinCosto} sin costo</p>
              <p className="text-xs text-[var(--data-error-500)] mt-0.5">Sin costo no se calcula el margen</p>
              <button className="mt-2 text-xs font-semibold text-[var(--data-error-500)] bg-[var(--data-error-100)] px-3 py-1 rounded-full hover:bg-[var(--data-error-500)] transition-colors">
                Agregar costos
              </button>
            </div>
          </div>
        )}
        {kpis.sinStock > 0 && (
          <div className="bg-gray-50 border border-[var(--rule-base)] rounded-xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <Eye className="h-5 w-5 text-[var(--text-secondary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">{kpis.sinStock} sin stock</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Estos productos no se muestran en la tienda</p>
              <button className="mt-2 text-xs font-semibold text-[var(--text-primary)] bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors">
                Ver productos
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <ChartExpandModal title="Valor del inventario por categoria" onClose={() => setExpandedChart(null)}>
            <ResponsiveContainer minWidth={0} width="100%" height={500}>
              <PieChart>
                <Pie data={inventoryByCat.slice(0, 8)} innerRadius={100} outerRadius={200} dataKey="value" paddingAngle={2} label>
                  {inventoryByCat.slice(0, 8).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
        </ChartExpandModal>
      )}
    </div>
  );
}

void ProductsDashboard;

// ── Componente principal ────────────────────────────────────────────────────

export default function CatalogoTiendaModule() {
  const [sub, setSub] = useState(TABS[0].id);


  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Promociones y Ofertas"
        description="Categorías, promociones, cupones y precios"
        icon={Tag}
      />



      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {/* Tab content */}
        {sub === "categorias" && <CategoriesEditorTab />}
        {sub === "promociones" && <PromotionsTab />}
        {sub === "cupones" && <CouponsTab />}
        {sub === "historial-precios" && <PriceHistoryTab />}
      </AdminTabBar>
    </div>
  );
}

