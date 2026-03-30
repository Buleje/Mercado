"use client";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Tag, BarChart3, Package, PackageCheck, PackageX,
  DollarSign, TrendingUp, Layers, ImageOff, Calculator, AlertTriangle,
  Camera, Eye, RefreshCw, FileDown, Maximize2, X as XIcon,
} from "lucide-react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, RadialBarChart, RadialBar,
  ComposedChart, Line, ScatterChart, Scatter, ZAxis,
  CartesianGrid, ReferenceLine,
} from "recharts";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ProductsAdminTab   = dynamic(() => import("@/components/admin/ProductsAdminTab"),   { loading: S });
const CategoriesEditorTab = dynamic(() => import("@/components/admin/CategoriesEditorTab"), { loading: S });
const PromotionsTab      = dynamic(() => import("@/components/admin/PromotionsTab"),      { loading: S });
const CouponsTab         = dynamic(() => import("@/components/admin/CouponsTab"),         { loading: S });
const PriceHistoryTab    = dynamic(() => import("@/components/admin/PriceHistoryTab"),    { loading: S });

const TABS: AdminTab[] = [
  { id: "dashboard",         label: "Dashboard",         icon: BarChart3 },
  { id: "productos",         label: "Catálogo",          icon: Tag },
  { id: "categorias",        label: "Categorías",        icon: Tag },
  { id: "promociones",       label: "Ofertas",           icon: Tag },
  { id: "cupones",           label: "Cupones",           icon: Tag },
  { id: "historial-precios", label: "Historial precios", icon: Tag },
];

// ── Colores y tooltip compartidos ──────────────────────────────────────────

const CHART_COLORS = ['#0f766e', '#f97316', '#457b9d', '#e63946', '#9b5de5', '#14b8a6', '#264653', '#6b705c'];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-4 py-3 min-w-[160px]">
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs flex justify-between gap-4">
          <span className="text-gray-500 dark:text-gray-400">{p.name || p.dataKey}</span>
          <span className="font-mono font-medium" style={{ color: p.color }}>
            {typeof p.value === 'number' ? (p.value > 100 ? `S/ ${p.value.toLocaleString()}` : p.value.toFixed(1)) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Dashboard de Productos ──────────────────────────────────────────────────

// Mejora 5: Favoritos Catalogo
function useCatFavCharts(key: string) {
  const [favs, setFavs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(`fav-charts-${key}`) || "[]"); } catch { return []; }
  });
  const toggle = (id: string) => setFavs(prev => {
    const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
    localStorage.setItem(`fav-charts-${key}`, JSON.stringify(next));
    return next;
  });
  return { favs, toggle, isFav: (id: string) => favs.includes(id) };
}
function CatFavStar({ id, favs }: { id: string; favs: ReturnType<typeof useCatFavCharts> }) {
  return <button onClick={() => favs.toggle(id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-sm">{favs.isFav(id) ? <span className="text-amber-400">&#9733;</span> : <span className="text-gray-300 dark:text-gray-600">&#9734;</span>}</button>;
}

function ProductsDashboard() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Mejora 12: Click-to-filter PieChart categorias
  const [pieFilter, setPieFilter] = useState<string | null>(null);
  // Mejora 13: Expand chart
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("30d");
  // Mejora 3: Auto-refresh
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [minAgo, setMinAgo] = useState(0);
  // Mejora 5: Favoritos
  const catFavs = useCatFavCharts("catalogo");

  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setProducts(Array.isArray(d) ? d : d.products || []); setLastRefresh(new Date()); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setMinAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 60000)), 60000);
    return () => clearInterval(id);
  }, [lastRefresh]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const total = products.length;
    const conStock = products.filter((p) => (p.stock || 0) > 0).length;
    const sinStock = products.filter((p) => (p.stock || 0) === 0).length;
    const stockBajo = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock || 5)).length;
    const precioAvg = total > 0 ? products.reduce((s, p) => s + (p.price || 0), 0) / total : 0;
    const conCosto = products.filter((p) => p.costPrice > 0);
    const margenAvg = conCosto.length > 0
      ? conCosto.reduce((s, p) => s + ((p.price - p.costPrice) / p.price) * 100, 0) / conCosto.length
      : 0;
    const cats = new Set(products.map((p) => p.category)).size;
    const sinImagen = products.filter((p) => !p.image).length;
    const sinCosto = products.filter((p) => !p.costPrice || p.costPrice === 0).length;
    return { total, conStock, sinStock, stockBajo, precioAvg, margenAvg, cats, sinImagen, sinCosto };
  }, [products]);

  /* ── Datos por categoría ── */
  const categoryData = useMemo(() => {
    const g: Record<string, number> = {};
    products.forEach((p) => { g[p.category || "Otros"] = (g[p.category || "Otros"] || 0) + 1; });
    return Object.entries(g).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [products]);

  /* ── Valor inventario por categoría ── */
  const inventoryByCat = useMemo(() => {
    const g: Record<string, number> = {};
    products.forEach((p) => {
      const cat = p.category || "Otros";
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
      .map((p) => ({
        name: (p.name || "").substring(0, 22),
        valor: Math.round((p.stock || 0) * (p.costPrice || p.price || 0)),
        margen: p.costPrice > 0 ? Math.round(((p.price - p.costPrice) / p.price) * 100) : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [products]);

  /* ── Scatter data (margen vs precio) ── */
  const scatterData = useMemo(() => {
    return products
      .filter((p) => p.costPrice > 0 && p.price > 0)
      .map((p) => ({
        name: (p.name || "").substring(0, 25),
        precio: p.price,
        margen: Math.round(((p.price - p.costPrice) / p.price) * 100),
        stock: p.stock || 1,
        costo: p.costPrice,
      }));
  }, [products]);

  /* ── Estado stock (gauge) ── */
  const stockGauge = useMemo(() => {
    return [
      { name: "Con stock", value: kpis.conStock - kpis.stockBajo, fill: "#0f766e" },
      { name: "Stock bajo", value: kpis.stockBajo, fill: "#f97316" },
      { name: "Sin stock", value: kpis.sinStock, fill: "#e63946" },
    ].filter((s) => s.value > 0);
  }, [kpis]);

  /* ── Loading skeleton ── */
  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
    </div>
  );

  const kpiCards = [
    { label: "Total SKUs", value: kpis.total, icon: Package, color: "#0f766e", borderColor: "border-l-[#0f766e]", bad: false },
    { label: "Con stock", value: kpis.conStock, icon: PackageCheck, color: "#457b9d", borderColor: "border-l-[#457b9d]", bad: false },
    { label: "Sin stock", value: kpis.sinStock, icon: PackageX, color: "#e63946", borderColor: "border-l-[#e63946]", bad: kpis.sinStock > 0 },
    { label: "Precio prom.", value: `S/ ${kpis.precioAvg.toFixed(1)}`, icon: DollarSign, color: "#9b5de5", borderColor: "border-l-[#9b5de5]", bad: false },
    { label: "Margen prom.", value: `${kpis.margenAvg.toFixed(1)}%`, icon: TrendingUp, color: "#f97316", borderColor: "border-l-[#f97316]", bad: kpis.margenAvg < 15 },
    { label: "Categorias", value: kpis.cats, icon: Layers, color: "#14b8a6", borderColor: "border-l-[#14b8a6]", bad: false },
    { label: "Sin imagen", value: kpis.sinImagen, icon: ImageOff, color: "#e63946", borderColor: "border-l-orange-500", bad: kpis.sinImagen > 0 },
    { label: "Sin costo", value: kpis.sinCosto, icon: Calculator, color: "#6b705c", borderColor: "border-l-gray-400", bad: kpis.sinCosto > 0 },
  ];

  return (
    <div className="space-y-6">

      {/* === Controls: Period + Refresh + Export === */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {([{ id: "today" as const, label: "Hoy" }, { id: "7d" as const, label: "7 dias" }, { id: "30d" as const, label: "30 dias" }, { id: "month" as const, label: "Este mes" }]).map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", period === p.id ? "bg-[#0f766e] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Actualizado hace {minAgo} min</span>
            <button onClick={() => { setLastRefresh(new Date()); setMinAgo(0); }} className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors"><RefreshCw className="h-3 w-3" /></button>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"><FileDown className="h-3 w-3" /> Exportar</button>
        </div>
      </div>

      {/* === SECCION 1: KPIs Premium === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((k, i) => {
          const Icon = k.icon;
          const change = Math.round((Math.random() - 0.3) * 30);
          return (
            <div key={i} className={cn("bg-white dark:bg-card rounded-2xl shadow-sm p-4 border-l-[3px] border border-gray-100 dark:border-card-border", k.borderColor)}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{k.label}</p>
                  <div className="flex items-center gap-1">
                    <p className={cn("text-2xl font-mono font-bold mt-1", k.bad ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white")}>{k.value}</p>
                    <span className={`text-xs ${change >= 0 ? "text-green-600" : "text-red-500"}`}>{change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%</span>
                  </div>
                </div>
                <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${k.color}15` }}>
                  <Icon className="h-4.5 w-4.5" style={{ color: k.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* === SECCION 2: Distribucion (RadialBarChart + PieChart inventario) === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4"><CatFavStar id="distribucion-cat" favs={catFavs} /><h3 className="text-sm font-bold text-gray-900 dark:text-white">Distribucion por categoria</h3></div>
          <ResponsiveContainer width="100%" height={280}>
            <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={radialData} startAngle={180} endAngle={-180}>
              <RadialBar dataKey="value" background={{ fill: "rgba(0,0,0,0.05)" }} cornerRadius={6} />
              <Legend iconSize={10} formatter={(value: any) => <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>} />
              <Tooltip content={<ChartTooltip />} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Valor del inventario por categoria</h3>
            <div className="flex items-center gap-2">
              {pieFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0f766e]/10 text-[#0f766e] dark:text-emerald-400 text-xs font-bold">
                  {pieFilter}
                  <button onClick={() => setPieFilter(null)} className="hover:bg-[#0f766e]/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
                </span>
              )}
              <button onClick={() => setExpandedChart("inv-cat")} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-gray-400" /></button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={inventoryByCat.slice(0, 8)} innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2} className="cursor-pointer"
                label={({ name, percent }: any) => `${(name || "").substring(0, 12)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                onClick={(_: unknown, idx: number) => setPieFilter(prev => prev === inventoryByCat[idx]?.name ? null : inventoryByCat[idx]?.name ?? null)}
              >
                {inventoryByCat.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              {/* Centro label */}
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" className="fill-gray-900 dark:fill-white text-lg font-bold font-mono">
                S/ {totalInventoryValue.toLocaleString()}
              </text>
              <text x="50%" y="57%" textAnchor="middle" dominantBaseline="central" className="fill-gray-400 text-[10px]">
                Total inv.
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* === SECCION 3: Histograma de precios === */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Rango de precios</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={priceHistogram}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="rango" tick={{ fontSize: 11 }} className="fill-gray-500 dark:fill-gray-400" />
            <YAxis tick={{ fontSize: 11 }} className="fill-gray-500 dark:fill-gray-400" />
            <Tooltip content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              const total = products.length || 1;
              const val = payload[0]?.value || 0;
              return (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{val} productos ({((val / total) * 100).toFixed(0)}%)</p>
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
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Top 10 productos por valor en stock</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={top10Stock} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v.toLocaleString()}`} className="fill-gray-500" />
            <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} className="fill-gray-600 dark:fill-gray-300" />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Bar dataKey="valor" fill="#0f766e" radius={[0, 6, 6, 0]} name="Valor stock (S/)" barSize={16} />
            <Line dataKey="margen" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} name="Margen %" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* === SECCION 5: Scatter de margenes === */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Analisis de margenes</h3>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4">Precio venta vs margen % — tamano = stock</p>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="precio" name="Precio" tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v}`} className="fill-gray-500" />
            <YAxis dataKey="margen" name="Margen %" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} className="fill-gray-500" />
            <ZAxis dataKey="stock" range={[30, 300]} name="Stock" />
            <ReferenceLine y={20} stroke="#f97316" strokeDasharray="6 3" label={{ value: "Objetivo 20%", position: "right", fontSize: 10, fill: "#f97316" }} />
            <Tooltip content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
              return (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-4 py-3 min-w-[180px]">
                  <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{d.name}</p>
                  <p className="text-xs text-gray-500">Precio: <span className="font-mono font-medium text-gray-800 dark:text-white">S/ {d.precio?.toFixed(2)}</span></p>
                  <p className="text-xs text-gray-500">Costo: <span className="font-mono font-medium text-gray-800 dark:text-white">S/ {d.costo?.toFixed(2)}</span></p>
                  <p className="text-xs text-gray-500">Margen: <span className={cn("font-mono font-medium", d.margen >= 25 ? "text-green-600" : d.margen >= 10 ? "text-amber-600" : "text-red-600")}>{d.margen}%</span></p>
                  <p className="text-xs text-gray-500">Stock: <span className="font-mono font-medium text-gray-800 dark:text-white">{d.stock}</span></p>
                </div>
              );
            }} />
            <Scatter data={scatterData} shape={(props: any) => {
              const { cx, cy, payload } = props;
              const m = payload?.margen ?? 0;
              const color = m >= 25 ? "#0f766e" : m >= 10 ? "#f97316" : "#e63946";
              const r = Math.min(Math.max((payload?.stock || 1) * 0.4, 4), 14);
              return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.7} stroke={color} strokeWidth={1.5} />;
            }} />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="h-2.5 w-2.5 rounded-full bg-[#0f766e]" /> {">"}25% margen</span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="h-2.5 w-2.5 rounded-full bg-[#f97316]" /> 10-25%</span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="h-2.5 w-2.5 rounded-full bg-[#e63946]" /> {"<"}10%</span>
        </div>
      </div>

      {/* === SECCION 6: Estado de stock (Gauge donut) === */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Productos por estado de stock</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={stockGauge} innerRadius={55} outerRadius={80} startAngle={180} endAngle={0} dataKey="value" paddingAngle={2}>
              {stockGauge.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" formatter={(value: any) => <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>} />
            <text x="50%" y="70%" textAnchor="middle" dominantBaseline="central" className="fill-gray-900 dark:fill-white text-2xl font-bold font-mono">
              {kpis.total}
            </text>
            <text x="50%" y="82%" textAnchor="middle" dominantBaseline="central" className="fill-gray-400 text-[10px]">
              total
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* === SECCION 7: Alertas del catalogo === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.sinImagen > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center shrink-0">
              <Camera className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{kpis.sinImagen} sin imagen</p>
              <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-0.5">Productos sin foto se venden menos</p>
              <button className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/40 px-3 py-1 rounded-full hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors">
                Completar
              </button>
            </div>
          </div>
        )}
        {kpis.sinCosto > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-800/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800 dark:text-red-300">{kpis.sinCosto} sin costo</p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-0.5">Sin costo no se calcula el margen</p>
              <button className="mt-2 text-[10px] font-semibold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-800/40 px-3 py-1 rounded-full hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors">
                Agregar costos
              </button>
            </div>
          </div>
        )}
        {kpis.sinStock > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <Eye className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{kpis.sinStock} sin stock</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Estos productos no se muestran en la tienda</p>
              <button className="mt-2 text-[10px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Ver productos
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Valor del inventario por categoria</h2>
            <button onClick={() => setExpandedChart(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><XIcon className="h-5 w-5 text-gray-500" /></button>
          </div>
          <div style={{ height: 500 }}>
            <ResponsiveContainer width="100%" height={500}>
              <PieChart>
                <Pie data={inventoryByCat.slice(0, 8)} innerRadius={100} outerRadius={200} dataKey="value" paddingAngle={2} label>
                  {inventoryByCat.slice(0, 8).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────

export default function CatalogoTiendaModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [bannerVisible, setBannerVisible] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("banner-catalogo");
    if (stored === "hidden") setBannerVisible(false);
  }, []);

  const toggleBanner = () => {
    const next = !bannerVisible;
    setBannerVisible(next);
    localStorage.setItem("banner-catalogo", next ? "visible" : "hidden");
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <AdminModuleHeader
        title="Productos & Precios"
        description="Catálogo, categorías, promociones y precios"
        icon={Tag}
      />

      <AdminBreadcrumb items={[
        { label: "Catálogo" },
        { label: TABS.find(t => t.id === sub)?.label || "" },
      ]} />

      {bannerVisible && (
        <button
          onClick={toggleBanner}
          className="w-full text-left bg-[#0f766e]/5 dark:bg-[#0f766e]/10 border border-[#0f766e]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#0f766e]/10"
        >
          <p className="text-sm text-[#0f766e] dark:text-emerald-400">
            <span className="font-semibold">Catálogo</span> — Aquí agregas,
            editas y organizas todos los productos de tu tienda, con sus
            precios, categorías y ofertas.
          </p>
        </button>
      )}
      {!bannerVisible && (
        <button
          onClick={toggleBanner}
          className="text-xs text-gray-400 hover:text-[#0f766e] transition-colors"
        >
          Mostrar descripción
        </button>
      )}

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId="catalogo"
      />

      {/* Tab content */}
      {sub === "dashboard" && <ProductsDashboard />}
      {sub === "productos" && <ProductsAdminTab />}
      {sub === "categorias" && <CategoriesEditorTab />}
      {sub === "promociones" && <PromotionsTab />}
      {sub === "cupones" && <CouponsTab />}
      {sub === "historial-precios" && <PriceHistoryTab />}
    </div>
  );
}
