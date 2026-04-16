"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  Package, FlaskConical, Layers,
  BookOpen, BarChart3, ChefHat,
} from "lucide-react";
import EmptyState from "@/components/admin/shared/EmptyState";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { RecetaCostBreakdown } from "@/lib/types/recetas";

// ── Recetas Dashboard ─────────────────────────────────────────────────────────

const RECETAS_DASH_COLORS = ["#2563EB", "#f97316", "#457b9d", "#9b5de5", "#e63946", "#2dd4bf"];

function RecetasDashboard() {
  const [data, setData] = useState<{ recetas: Array<Record<string, unknown>>; lotes: Array<Record<string, unknown>> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/recetas").then(r => r.ok ? r.json() : []),
      fetch("/api/recetas/produccion").then(r => r.ok ? r.json() : []),
    ]).then(([recetasRes, lotesRes]) => {
      setData({
        recetas: recetasRes.status === "fulfilled" ? (Array.isArray(recetasRes.value) ? recetasRes.value : []) : [],
        lotes: lotesRes.status === "fulfilled" ? (Array.isArray(lotesRes.value) ? lotesRes.value : []) : [],
      });
      setLoading(false);
    });
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />)}
        </div>
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
    );
  }

  const recetas = data.recetas;
  const lotes = data.lotes;
  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // KPIs
  const recetasActivas = recetas.filter((r: Record<string, unknown>) => r.activa === true).length;
  const lotesMes = lotes.filter((l: Record<string, unknown>) => String(l.producidoEn ?? l.createdAt ?? "").startsWith(mesActual)).length;
  const costoPromedio = recetas.length > 0
    ? recetas.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.costoTotal) || 0), 0) / recetas.length
    : 0;
  const ingredientesTotales = recetas.reduce((s: number, r: Record<string, unknown>) => {
    const ings = Array.isArray(r.ingredientes) ? r.ingredientes : [];
    return s + ings.length;
  }, 0);

  // Lotes por semana (ultimas 4 semanas)
  const weeklyData: { semana: string; lotes: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i + 1) * 7);
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
    const label = `S${4 - i}`;
    const count = lotes.filter((l: Record<string, unknown>) => {
      const d = new Date(String(l.producidoEn ?? l.createdAt ?? ""));
      return d >= weekStart && d < weekEnd;
    }).length;
    weeklyData.push({ semana: label, lotes: count });
  }

  // Recetas por categoria (usar descripcion como pseudo-categoria)
  const catMap = new Map<string, number>();
  for (const r of recetas) {
    const cat = String(r.descripcion ?? "Sin categoria").split(" ")[0] || "General";
    catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
  }
  const categoryData = Array.from(catMap.entries())
    .map(([name, value]) => ({ name: name.length > 12 ? name.slice(0, 10) + "..." : name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Top 5 recetas mas producidas
  const recetaProduccion = new Map<string, { nombre: string; count: number }>();
  for (const l of lotes) {
    const recetaId = String(l.recetaId ?? "");
    const recetaNombre = (l.receta as Record<string, unknown>)?.nombre as string ?? recetaId;
    const prev = recetaProduccion.get(recetaId) ?? { nombre: recetaNombre, count: 0 };
    prev.count += Number(l.cantidad) || 1;
    recetaProduccion.set(recetaId, prev);
  }
  const top5Recetas = Array.from(recetaProduccion.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 * 0.1 }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Recetas activas", value: String(recetasActivas), border: "border-b-4 border-[#2563EB]" },
          { label: "Lotes del mes", value: String(lotesMes), border: "border-b-4 border-[#f97316]" },
          { label: "Costo promedio", value: `S/${costoPromedio.toFixed(2)}`, border: "border-b-4 border-purple-500" },
          { label: "Ingredientes totales", value: String(ingredientesTotales), border: "border-b-4 border-emerald-500" },
        ].map(k => (
          <div key={k.label} className={cn("bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 shadow-sm", k.border)}>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{k.label}</p>
            <p className="text-2xl font-mono font-bold mt-1 text-gray-900 dark:text-white">{k.value}</p>
          </div>
        ))}
      </div>
      </m.div>

      {/* Lotes producidos por semana */}
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 * 0.1 }}>
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Lotes producidos por semana</h3>
        {weeklyData.some(d => d.lotes > 0) ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={((v: number) => [`${v} lotes`, "Produccion"]) as any} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
              <Bar dataKey="lotes" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Sin lotes producidos en las ultimas semanas" />
        )}
      </div>
      </m.div>

      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 * 0.1 }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PieChart: recetas por categoria */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Recetas por tipo</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryData} innerRadius={50} outerRadius={80} dataKey="value" label>
                  {categoryData.map((_, i) => <Cell key={i} fill={RECETAS_DASH_COLORS[i % RECETAS_DASH_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Sin datos de categorias" />
          )}
        </div>

        {/* Top 5 recetas mas producidas */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Top 5 recetas mas producidas</h3>
          {top5Recetas.length > 0 ? (
            <div className="space-y-3">
              {top5Recetas.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white text-[10px] flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{r.nombre}</span>
                  <span className="text-sm font-bold font-mono text-gray-900 dark:text-white">{r.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart message="Sin produccion registrada" />
          )}
        </div>
      </div>
      </m.div>
    </div>
  );
}

const RecetarioAdminTab = React.lazy(() => import("@/components/admin/recetas/RecetarioAdminTab"));

// ── Empty state for charts ───────────────────────────────────────────────────
function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3"><ChefHat className="h-6 w-6 text-primary" /></div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{message}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Los datos apareceran cuando registres actividad</p>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Ingrediente = {
  id: string;
  recetaId: string;
  productoId: number;
  cantidad: number;
  unidad: string;
};

type Receta = {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion?: string;
  productoId?: number;
  costoTotal: number;
  activa: boolean;
  ingredientes: Ingrediente[];
  createdAt: string;
  updatedAt: string;
};

type ProductInfo = {
  id: number;
  name: string;
  price: number;
  costPrice?: number | null;
};

type ProduccionLote = {
  id: string;
  tenantId: string;
  recetaId: string;
  cantidad: number;
  costoReal: number;
  notas?: string;
  producidoEn: string;
  receta?: { nombre: string };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const PER_PAGE = 10;

// ── Component ─────────────────────────────────────────────────────────────────

const RECETAS_MODULE_ID = "recetas";

export default function RecetasModule() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "recetas" | "produccion" | "recetario">(() => {
    if (typeof window === "undefined") return "dashboard";
    const stored = localStorage.getItem(`admin-last-tab-${RECETAS_MODULE_ID}`);
    if (stored === "dashboard" || stored === "recetas" || stored === "produccion" || stored === "recetario") return stored;
    return "dashboard";
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${RECETAS_MODULE_ID}`, activeTab); }, [activeTab]);

  // Recetas list
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Products map for cost/margin calculation
  const [productsMap, setProductsMap] = useState<Record<number, ProductInfo>>({});

  // Detail
  const [selected, setSelected] = useState<Receta | null>(null);

  // Real cost breakdown from API (contract: RecetaCostBreakdown)
  const [costData, setCostData] = useState<RecetaCostBreakdown | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // New receta multi-step
  const [showNew, setShowNew] = useState(false);
  const [step, setStep] = useState(1);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProductoId, setNewProductoId] = useState("");
  const [newIngredientes, setNewIngredientes] = useState<{ productoId: string; cantidad: string; unidad: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Mejora nueva: Busqueda y filtro de recetas
  const [recetaSearch, setRecetaSearch] = useState("");
  const [recetaFilter, setRecetaFilter] = useState<"todas" | "activas" | "inactivas">("todas");
  const [recetaSort, setRecetaSort] = useState<"nombre" | "costo-asc" | "costo-desc" | "recientes">("nombre");
  const [recetaSearchDebounced, setRecetaSearchDebounced] = useState("");

  // Debounce search 200ms
  useEffect(() => {
    const t = setTimeout(() => setRecetaSearchDebounced(recetaSearch), 200);
    return () => clearTimeout(t);
  }, [recetaSearch]);

  // Producir modal
  const [showProducir, setShowProducir] = useState(false);
  const [producirCantidad, setProducirCantidad] = useState("");
  const [producirNotas, setProducirNotas] = useState("");
  const [producing, setProducing] = useState(false);
  const [producirError, setProducirError] = useState<string | null>(null);

  // Produccion tab
  const [lotes, _setLotes] = useState<ProduccionLote[]>([]);
  const [_lotesLoading, _setLotesLoading] = useState(false);
  const [lotesPage, _setLotesPage] = useState(1);

  // ── Fetch recetas ──────────────────────────────────────────────────────────

  const fetchRecetas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recetasRes, prodsRes] = await Promise.all([
        fetch("/api/recetas"),
        fetch("/api/products?limit=500"),
      ]);
      if (!recetasRes.ok) throw new Error("Error al cargar recetas");
      const data: Receta[] = await recetasRes.json();
      setRecetas(data);

      // Build products map for cost calculations
      if (prodsRes.ok) {
        const prods: ProductInfo[] = await prodsRes.json();
        const map: Record<number, ProductInfo> = {};
        for (const p of prods) map[p.id] = p;
        setProductsMap(map);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecetas(); }, [fetchRecetas]);

  // UX Mejora 13: Cerrar modales con Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showProducir) { setShowProducir(false); return; }
      if (showNew) { setShowNew(false); return; }
      if (selected) { setSelected(null); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showProducir, showNew, selected]);

  // ── Open detail ────────────────────────────────────────────────────────────

  const openDetail = async (receta: Receta) => {
    setSelected(receta);
    setCostData(null);
    setCostLoading(true);
    try {
      const [detailRes, costRes] = await Promise.allSettled([
        fetch(`/api/recetas/${receta.id}`),
        fetch(`/api/recetas/${receta.id}/cost-breakdown`),
      ]);
      if (detailRes.status === "fulfilled" && detailRes.value.ok) {
        const detail: Receta = await detailRes.value.json();
        setSelected(detail);
      }
      if (costRes.status === "fulfilled" && costRes.value.ok) {
        const cost: RecetaCostBreakdown = await costRes.value.json();
        setCostData(cost);
      }
    } catch {
      // fallback to list data
    } finally {
      setCostLoading(false);
    }
  };

  // ── Create receta ──────────────────────────────────────────────────────────

  const resetNew = () => {
    setShowNew(false); setStep(1); setNewName(""); setNewDesc("");
    setNewProductoId(""); setNewIngredientes([]); setCreateError(null);
  };

  const addIngrediente = () => {
    setNewIngredientes(prev => [...prev, { productoId: "", cantidad: "", unidad: "unidad" }]);
  };

  const removeIngrediente = (i: number) => {
    setNewIngredientes(prev => prev.filter((_, idx) => idx !== i));
  };

  const updateIngrediente = (i: number, field: string, value: string) => {
    setNewIngredientes(prev => prev.map((ing, idx) =>
      idx === i ? { ...ing, [field]: value } : ing
    ));
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!newName.trim()) { setCreateError("Nombre requerido"); return; }
    if (newIngredientes.length === 0) { setCreateError("Agrega al menos un ingrediente"); return; }

    const ingredientes = newIngredientes.map(i => ({
      productoId: parseInt(i.productoId),
      cantidad: parseFloat(i.cantidad),
      unidad: i.unidad || "unidad",
    }));

    const invalid = ingredientes.some(i => isNaN(i.productoId) || isNaN(i.cantidad) || i.cantidad <= 0);
    if (invalid) { setCreateError("Revisa los ingredientes: ID y cantidad son requeridos"); return; }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        nombre: newName.trim(),
        ingredientes,
      };
      if (newDesc.trim()) body.descripcion = newDesc.trim();
      if (newProductoId.trim()) body.productoId = parseInt(newProductoId);

      const res = await fetch("/api/recetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(err.error || "Error al crear receta");
      }
      resetNew();
      fetchRecetas();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  // ── Producir lote ──────────────────────────────────────────────────────────

  const handleProducir = async () => {
    if (!selected) return;
    setProducirError(null);
    const cantidad = parseInt(producirCantidad);
    if (isNaN(cantidad) || cantidad <= 0) { setProducirError("Cantidad inválida"); return; }

    setProducing(true);
    try {
      const body: Record<string, unknown> = { cantidad };
      if (producirNotas.trim()) body.notas = producirNotas.trim();

      const res = await fetch(`/api/recetas/${selected.id}/producir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al producir");
      }
      setShowProducir(false);
      setProducirCantidad("");
      setProducirNotas("");
      fetchRecetas();
    } catch (e) {
      setProducirError(e instanceof Error ? e.message : "Error");
    } finally {
      setProducing(false);
    }
  };

  // ── Calculated cost for new receta preview ─────────────────────────────────

  const _estimatedCost = newIngredientes.reduce((sum, i) => {
    const c = parseFloat(i.cantidad);
    return sum + (isNaN(c) ? 0 : c);
  }, 0);

  // Lotes — totales
  const _lotesTotalPages = Math.max(1, Math.ceil(lotes.length / PER_PAGE));
  const _lotesPaginated = lotes.slice((lotesPage - 1) * PER_PAGE, lotesPage * PER_PAGE);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — Mejora 20 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="h-10 w-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-sm shrink-0">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Recetas
              {/* Mejora 20 (R3): Badge de estado */}
              {!loading && recetas.length > 0 && (
                <span className="ml-2 text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full align-middle">{recetas.filter(r => r.activa).length} recetas</span>
              )}
            </h1>
            <p className="text-sm text-gray-500">Producción interna con control de costos</p>
          </div>
        </div>
        {activeTab === "recetas" && (
          <button
            onClick={() => { setShowNew(true); addIngrediente(); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] shadow-sm transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nueva Receta
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-card-border -mx-1 px-1 overflow-x-auto">
        {(["dashboard", "recetas", "produccion", "recetario"] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              "shrink-0 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5",
              activeTab === t
                ? "border-[#2563EB] text-[#2563EB] dark:text-emerald-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            {t === "dashboard" ? <><BarChart3 className="h-3.5 w-3.5" /> Dashboard</> : t === "recetas" ? "Recetas" : t === "produccion" ? "Produccion" : <><BookOpen className="h-3.5 w-3.5" /> Recetario Web</>}
          </button>
        ))}
      </div>

      {/* ── Tab: Dashboard ─────────────────────────────────────────────────────── */}
      {activeTab === "dashboard" && <RecetasDashboard />}

      {/* ── Tab: Recetas ──────────────────────────────────────────────────────── */}
      {activeTab === "recetas" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button onClick={fetchRecetas} className="text-xs text-[#2563EB] hover:underline font-semibold">Reintentar</button>
            </div>
          ) : recetas.length === 0 ? (
            <EmptyState
              icon={ChefHat}
              title="Sin recetas"
              description="Crea tu primera receta para empezar."
              action={{ label: "Crear primera receta", onClick: () => { setShowNew(true); addIngrediente(); } }}
            />
          ) : (() => {
            // Mejora 6: Filtrar y ordenar recetas
            let filtered = recetas.filter(r => {
              if (recetaFilter === "activas" && !r.activa) return false;
              if (recetaFilter === "inactivas" && r.activa) return false;
              if (recetaSearchDebounced) {
                return r.nombre.toLowerCase().includes(recetaSearchDebounced.toLowerCase());
              }
              return true;
            });
            filtered = [...filtered].sort((a, b) => {
              switch (recetaSort) {
                case "nombre": return a.nombre.localeCompare(b.nombre);
                case "costo-asc": return a.costoTotal - b.costoTotal;
                case "costo-desc": return b.costoTotal - a.costoTotal;
                case "recientes": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                default: return 0;
              }
            });

            return (
              <>
                {/* Mejora 6: Barra de busqueda y filtros */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar receta..."
                      value={recetaSearch}
                      onChange={e => setRecetaSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["todas", "activas", "inactivas"] as const).map(f => (
                      <button key={f} onClick={() => setRecetaFilter(f)} className={cn(
                        "shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors",
                        recetaFilter === f ? "bg-[#2563EB] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
                      )}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <select
                    value={recetaSort}
                    onChange={e => setRecetaSort(e.target.value as typeof recetaSort)}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                  >
                    <option value="nombre">Nombre A-Z</option>
                    <option value="costo-asc">Costo menor</option>
                    <option value="costo-desc">Costo mayor</option>
                    <option value="recientes">Mas recientes</option>
                  </select>
                </div>

                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Search className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">No se encontraron recetas con &apos;{recetaSearchDebounced}&apos;</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(r => {
                      const productoFinal = r.productoId ? productsMap[r.productoId] : null;
                      const precioVenta = productoFinal?.price ?? 0;
                      const margen = precioVenta > 0 && r.costoTotal > 0
                        ? Math.round(((precioVenta - r.costoTotal) / precioVenta) * 100)
                        : null;

                      return (
                        <div
                          key={r.id}
                          className={cn(
                            "relative text-left bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm hover:shadow-lg hover:scale-[1.01] transition-all group",
                            !r.activa && "opacity-60"
                          )}
                        >
                          {!r.activa && (
                            <span className="absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">Inactiva</span>
                          )}
                          <div className="text-center mb-3">
                            <span className="text-4xl">
                              {r.nombre.toLowerCase().includes("pollo") ? "\uD83C\uDF57" :
                               r.nombre.toLowerCase().includes("arroz") ? "\uD83C\uDF5A" :
                               r.nombre.toLowerCase().includes("sopa") ? "\uD83C\uDF72" :
                               r.nombre.toLowerCase().includes("jugo") ? "\uD83E\uDDC3" :
                               r.nombre.toLowerCase().includes("ensalada") ? "\uD83E\uDD57" :
                               "\uD83C\uDF73"}
                            </span>
                          </div>
                          <p className="font-bold text-gray-900 dark:text-white text-center truncate group-hover:text-[#2563EB] transition-colors">{r.nombre}</p>
                          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 rounded-full px-2 py-0.5">
                              <Package className="h-3 w-3" /> {r.ingredientes.length} ing.
                            </span>
                          </div>
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Costo:</span>
                              <span className="text-sm font-bold font-mono text-gray-900 dark:text-white">{formatCurrency(r.costoTotal)}</span>
                            </div>
                            {margen !== null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Margen:</span>
                                <span className={cn(
                                  "text-xs font-bold",
                                  margen >= 20 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                                )}>
                                  {margen}% {margen >= 20 ? "\u2713" : ""}
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Mejora 14 (R3): Badge disponibilidad ingredientes */}
                          {r.ingredientes.length > 0 && (() => {
                            const disponibles = r.ingredientes.filter(ing => {
                              const prod = productsMap[ing.productoId] as unknown as { stock?: number } | undefined;
                              return prod && (prod.stock ?? 0) >= ing.cantidad;
                            }).length;
                            const total = r.ingredientes.length;
                            const faltan = total - disponibles;
                            return (
                              <div className="mt-2 text-center">
                                <span className={cn(
                                  "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  faltan === 0 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                    : faltan < total ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                )}>
                                  {faltan === 0 ? `\u2713 ${disponibles}/${total} disponibles` : `\u26A0 ${faltan} faltan`}
                                </span>
                              </div>
                            );
                          })()}
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelected(r); setShowProducir(true); setProducirCantidad(""); setProducirNotas(""); }}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                            >
                              Producir
                            </button>
                            <button
                              onClick={() => openDetail(r)}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#2563EB] bg-[#2563EB]/10 hover:bg-[#2563EB]/20 transition-colors"
                            >
                              Ver detalle
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* ── Tab: Produccion ───────────────────────────────────────────────────── */}
      {activeTab === "produccion" && (
        <ProduccionTab />
      )}

      {/* ── Tab: Recetario Web ─────────────────────────────────────────────────── */}
      {activeTab === "recetario" && (
        <React.Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" /></div>}>
          <RecetarioAdminTab />
        </React.Suspense>
      )}

      {/* ── Detail Sheet ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div
              key="receta-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <m.div
              key="receta-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-card border-l border-gray-200 dark:border-card-border shadow-2xl overflow-y-auto"
            >
              <div className="p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selected.nombre}</h3>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                {selected.descripcion && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selected.descripcion}</p>
                )}

                {/* ── Análisis de costo (contract RecetaCostBreakdown) ─────── */}
                {costLoading && (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                    <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Cargando análisis de costo...</span>
                  </div>
                )}
                {costData && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Análisis de costo</p>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-lg",
                        costData.margenPorcentaje >= 30
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                          : costData.margenPorcentaje >= 10
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                      )}>
                        Margen: {costData.margenPorcentaje.toFixed(1)}%
                      </span>
                    </div>

                    {/* Desglose por componente */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                        <p className="text-[10px] uppercase text-gray-500">Ingredientes</p>
                        <p className="font-bold font-mono text-gray-900 dark:text-white">{formatCurrency(costData.costoIngredientes)}</p>
                      </div>
                      <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                        <p className="text-[10px] uppercase text-gray-500">Mano de obra</p>
                        <p className="font-bold font-mono text-gray-900 dark:text-white">{formatCurrency(costData.costoManoObra)}</p>
                      </div>
                      <div className="bg-white/60 dark:bg-white/5 rounded-lg p-2">
                        <p className="text-[10px] uppercase text-gray-500">Indirectos</p>
                        <p className="font-bold font-mono text-gray-900 dark:text-white">{formatCurrency(costData.costoIndirectos)}</p>
                      </div>
                      <div className="bg-white dark:bg-white/10 rounded-lg p-2 border border-emerald-300 dark:border-emerald-700">
                        <p className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400">Total unitario</p>
                        <p className="font-bold font-mono text-gray-900 dark:text-white">{formatCurrency(costData.costoTotalUnitario)}</p>
                      </div>
                    </div>

                    {/* Precio venta + margen bruto */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-emerald-200 dark:border-emerald-800">
                      <span className="text-gray-600 dark:text-gray-400">
                        Precio venta: <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(costData.precioVenta)}</span>
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        Margen bruto: <span className={cn(
                          "font-bold",
                          costData.margenBruto >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                        )}>{formatCurrency(costData.margenBruto)}</span>
                      </span>
                    </div>

                    {costData.ingredientes.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                        <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">Desglose de ingredientes</p>
                        {costData.ingredientes.map((ing, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate flex-1 mr-2">
                              {ing.nombre} ({ing.cantidad} {ing.unidad} x {formatCurrency(ing.costoUnitario)})
                            </span>
                            <span className="font-bold font-mono text-gray-900 dark:text-white shrink-0">
                              {formatCurrency(ing.costoLinea)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const prodFinal = selected.productoId ? productsMap[selected.productoId] : null;
                  const precioVenta = prodFinal?.price ?? 0;
                  const margen = precioVenta > 0 && selected.costoTotal > 0
                    ? Math.round(((precioVenta - selected.costoTotal) / precioVenta) * 100)
                    : null;

                  return (
                    <>
                      {/* Cost summary */}
                      <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase font-bold text-gray-400">Costo total estimado</p>
                          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(selected.costoTotal)}</p>
                        </div>
                        {prodFinal && (
                          <div className="pt-2 border-t border-gray-200 dark:border-white/10 space-y-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Producto final: <span className="font-bold text-gray-700 dark:text-gray-300">{prodFinal.name}</span>
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-gray-500">
                                Costo: <span className="font-bold">{formatCurrency(selected.costoTotal)}</span>
                              </span>
                              <span className="text-xs text-gray-400">&rarr;</span>
                              <span className="text-xs text-gray-500">
                                Venta: <span className="font-bold">{formatCurrency(precioVenta)}</span>
                              </span>
                              {margen !== null && (
                                <>
                                  <span className="text-xs text-gray-400">&rarr;</span>
                                  <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded-lg",
                                    margen >= 30
                                      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                      : margen >= 10
                                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                  )}>
                                    Margen: {margen}%
                                  </span>
                                </>
                              )}
                            </div>
                            {margen !== null && margen < 10 && (
                              <p className="text-[11px] font-bold text-red-600 dark:text-red-400 mt-1">
                                Margen muy bajo &mdash; revisa tus precios
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Ingredientes with cost column */}
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Ingredientes</h4>
                        {selected.ingredientes.length === 0 ? (
                          <p className="text-sm text-gray-400">Sin ingredientes</p>
                        ) : (
                          <div className="space-y-2">
                            {selected.ingredientes.map(ing => {
                              const prod = productsMap[ing.productoId];
                              const costoUnit = prod?.costPrice ?? prod?.price ?? 0;
                              const costoLinea = costoUnit * ing.cantidad;
                              return (
                                <div key={ing.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                    <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                      {prod?.name ?? `Producto #${ing.productoId}`}
                                    </p>
                                    <p className="text-[10px] text-gray-400">
                                      {ing.cantidad} {ing.unidad} x {formatCurrency(costoUnit)}
                                    </p>
                                  </div>
                                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300 shrink-0">
                                    {formatCurrency(costoLinea)}
                                  </p>
                                </div>
                              );
                            })}
                            {/* Total row */}
                            <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-white/10 rounded-xl">
                              <p className="text-xs font-bold text-gray-600 dark:text-gray-400">Total ingredientes</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selected.costoTotal)}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Producir button */}
                      <button
                        onClick={() => { setShowProducir(true); setProducirError(null); }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] shadow-sm transition-colors"
                      >
                        <Layers className="h-4 w-4" />
                        Producir Lote
                      </button>
                    </>
                  );
                })()}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── New Receta Modal (multi-step) ─────────────────────────────────────── */}
      <AnimatePresence>
        {showNew && (
          <>
            <m.div
              key="new-receta-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={resetNew}
            />
            <m.div
              key="new-receta-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && resetNew()}
            >
              <div className="w-full max-w-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* UX Mejora 12: Sticky header */}
                <div className="sticky top-0 z-10 bg-white dark:bg-card border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Nueva Receta — Paso {step}/3
                  </h3>
                  <button onClick={resetNew} className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                {/* Steps indicator */}
                <div className="flex gap-2">
                  {[1, 2, 3].map(s => (
                    <div key={s} className={cn("flex-1 h-1.5 rounded-full", step >= s ? "bg-[#2563EB]" : "bg-gray-200 dark:bg-white/10")} />
                  ))}
                </div>

                {/* Step 1: Nombre */}
                {step === 1 && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Nombre de la receta</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Ej: Pan de yuca"
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Descripción (opcional)</label>
                      <textarea
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                        placeholder="Proceso de preparación..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">ID Producto final (opcional)</label>
                      <input
                        type="number"
                        value={newProductoId}
                        onChange={e => setNewProductoId(e.target.value)}
                        placeholder="ID del producto resultante"
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                  </div>
                )}

                {/* Step 2: Ingredientes */}
                {step === 2 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Ingredientes</p>
                      <button
                        onClick={addIngrediente}
                        className="text-xs font-bold text-[#2563EB] hover:underline"
                      >
                        + Agregar
                      </button>
                    </div>
                    {newIngredientes.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Agrega ingredientes con el botón de arriba</p>
                    )}
                    {newIngredientes.map((ing, i) => (
                      <div key={i} className="flex gap-2 items-end bg-gray-50 dark:bg-white/5 rounded-xl p-3">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">ID Producto</label>
                          <input
                            type="number"
                            value={ing.productoId}
                            onChange={e => updateIngrediente(i, "productoId", e.target.value)}
                            placeholder="ID"
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]/30"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Cantidad</label>
                          <input
                            type="number"
                            step="0.01"
                            value={ing.cantidad}
                            onChange={e => updateIngrediente(i, "cantidad", e.target.value)}
                            placeholder="0"
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]/30"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Unidad</label>
                          <input
                            type="text"
                            value={ing.unidad}
                            onChange={e => updateIngrediente(i, "unidad", e.target.value)}
                            placeholder="kg"
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]/30"
                          />
                        </div>
                        <button
                          onClick={() => removeIngrediente(i)}
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Step 3: Resumen */}
                {step === 3 && (
                  <div className="space-y-3">
                    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{newName || "Sin nombre"}</p>
                      {newDesc && <p className="text-xs text-gray-500">{newDesc}</p>}
                      <p className="text-xs text-gray-400">{newIngredientes.length} ingredientes</p>
                    </div>
                  </div>
                )}

                {createError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{createError}</p>
                )}
                </div>
                {/* UX Mejora 12: Sticky footer */}
                <div className="sticky bottom-0 bg-white dark:bg-card border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                  {step > 1 ? (
                    <button
                      onClick={() => setStep(s => s - 1)}
                      className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                      Anterior
                    </button>
                  ) : (
                    <button
                      onClick={resetNew}
                      className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  {step < 3 ? (
                    <button
                      onClick={() => setStep(s => s + 1)}
                      className="px-4 py-2 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-sm transition-colors"
                    >
                      Siguiente
                    </button>
                  ) : (
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg shadow-sm transition-colors"
                    >
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Crear Receta
                    </button>
                  )}
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Producir Modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showProducir && selected && (
          <>
            <m.div
              key="producir-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowProducir(false)}
            />
            <m.div
              key="producir-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowProducir(false)}
            >
              <div className="w-full max-w-sm bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-5 space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Producir Lote</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Receta: <span className="font-bold text-gray-900 dark:text-white">{selected.nombre}</span>
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Cantidad a producir</label>
                    <input
                      type="number"
                      min="1"
                      value={producirCantidad}
                      onChange={e => setProducirCantidad(e.target.value)}
                      placeholder="Ej: 10"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>

                  {/* Cost estimate card */}
                  {(() => {
                    const qty = parseInt(producirCantidad) || 0;
                    if (qty <= 0 || selected.costoTotal <= 0) return null;
                    const costoLote = selected.costoTotal * qty;
                    const costoUnitario = selected.costoTotal;
                    const prodFinal = selected.productoId ? productsMap[selected.productoId] : null;
                    const precioVenta = prodFinal?.price ?? 0;
                    const margen = precioVenta > 0 ? Math.round(((precioVenta - costoUnitario) / precioVenta) * 100) : null;

                    return (
                      <div className="bg-[#2563EB]/5 dark:bg-[#2563EB]/10 border border-[#2563EB]/20 rounded-xl p-3 space-y-1.5">
                        <p className="text-[10px] uppercase font-bold text-[#2563EB] dark:text-emerald-400">Estimacion de costos</p>
                        <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                          <span>Costo por lote ({qty} uds):</span>
                          <span className="font-bold">{formatCurrency(costoLote)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                          <span>Costo por unidad:</span>
                          <span className="font-bold">{formatCurrency(costoUnitario)}</span>
                        </div>
                        {margen !== null && (
                          <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300 pt-1 border-t border-[#2563EB]/10">
                            <span>Si vendes a {formatCurrency(precioVenta)}:</span>
                            <span className={cn(
                              "font-bold",
                              margen >= 30
                                ? "text-emerald-600 dark:text-emerald-400"
                                : margen >= 10
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400"
                            )}>
                              margen de {margen}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mejora M5: Alerta de ingredientes insuficientes */}
                  {(() => {
                    const qty = parseInt(producirCantidad) || 0;
                    if (qty <= 0 || selected.ingredientes.length === 0) return null;

                    const faltantes: { nombre: string; necesario: number; disponible: number; unidad: string }[] = [];
                    let todosDisponibles = true;

                    for (const ing of selected.ingredientes) {
                      const prod = productsMap[ing.productoId];
                      const necesario = ing.cantidad * qty;
                      const disponible = (prod as unknown as { stock?: number })?.stock ?? 0;
                      const nombre = prod?.name ?? `Producto #${ing.productoId}`;

                      if (necesario > disponible) {
                        todosDisponibles = false;
                        faltantes.push({ nombre, necesario, disponible, unidad: ing.unidad });
                      }
                    }

                    if (todosDisponibles) {
                      return (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Todos los ingredientes disponibles</p>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-red-700 dark:text-red-400">
                          {faltantes.length} ingrediente{faltantes.length !== 1 ? "s" : ""} insuficiente{faltantes.length !== 1 ? "s" : ""} — no se puede producir
                        </p>
                        {faltantes.map((f, i) => (
                          <p key={i} className="text-xs text-red-600 dark:text-red-400">
                            Insuficiente: necesitas {f.necesario} {f.unidad} de {f.nombre}, tienes {f.disponible}
                          </p>
                        ))}
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Notas (opcional)</label>
                    <input
                      type="text"
                      value={producirNotas}
                      onChange={e => setProducirNotas(e.target.value)}
                      placeholder="Observaciones..."
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>
                </div>

                {producirError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{producirError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowProducir(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleProducir}
                    disabled={producing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 shadow-sm transition-colors"
                  >
                    {producing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                    Producir
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Produccion Tab (sub-component) ────────────────────────────────────────────

function ProduccionTab() {
  const [lotes, setLotes] = useState<ProduccionLote[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/recetas");
        if (!res.ok) throw new Error();
        const _recetas: Receta[] = await res.json();
        // Intentar obtener lotes de produccion
        try {
          const lotesRes = await fetch("/api/produccion");
          if (lotesRes.ok) {
            const lotesData: ProduccionLote[] = await lotesRes.json();
            setLotes(lotesData);
          } else {
            setLotes([]);
          }
        } catch {
          setLotes([]);
        }
      } catch {
        setLotes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalPages = Math.max(1, Math.ceil(lotes.length / PER_PAGE));
  const paginated = lotes.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Mejora M6: KPIs y grafica de produccion (memoized)
  const { lotesEsteMes, costoPromedio, unidadesProducidas, chartData } = useMemo(() => {
    const now = new Date();
    const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lotesEsteMes = lotes.filter(l => l.producidoEn.startsWith(mesActual));
    const costoPromedio = lotesEsteMes.length > 0 ? lotesEsteMes.reduce((s, l) => s + l.costoReal, 0) / lotesEsteMes.length : 0;
    const unidadesProducidas = lotesEsteMes.reduce((s, l) => s + l.cantidad, 0);

    // Grafica semanal ultimas 4 semanas
    const chartData: { semana: string; lotes: number; costo: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (w * 7 + weekStart.getDay()));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekLotes = lotes.filter(l => {
        const d = new Date(l.producidoEn);
        return d >= weekStart && d < weekEnd;
      });
      chartData.push({
        semana: `Sem ${4 - w}`,
        lotes: weekLotes.length,
        costo: weekLotes.reduce((s, l) => s + l.costoReal, 0),
      });
    }

    return { lotesEsteMes, costoPromedio, unidadesProducidas, chartData };
  }, [lotes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mejora M6: KPIs de produccion */}
      {lotes.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
              <p className="text-[10px] uppercase font-bold text-gray-400">Lotes este mes</p>
              <p className="text-lg font-extrabold text-gray-900 dark:text-white">{lotesEsteMes.length}</p>
            </div>
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
              <p className="text-[10px] uppercase font-bold text-gray-400">Costo promedio</p>
              <p className="text-lg font-extrabold text-gray-900 dark:text-white">{formatCurrency(costoPromedio)}</p>
            </div>
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
              <p className="text-[10px] uppercase font-bold text-gray-400">Unidades producidas</p>
              <p className="text-lg font-extrabold text-[#2563EB]">{unidadesProducidas}</p>
            </div>
          </div>

          {/* Grafica semanal */}
          {chartData.some(d => d.lotes > 0) && (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Produccion semanal (ultimas 4 semanas)
              </h4>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: unknown, name: unknown) => {
                    const v = Number(value);
                    const n = String(name);
                    return [n === "lotes" ? `${v} lotes` : `S/${v.toFixed(2)}`, n === "lotes" ? "Lotes" : "Costo total"];
                  }} />
                  <Bar dataKey="lotes" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
        {lotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Layers className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aun no has registrado lotes de produccion</p>
            <p className="text-xs text-gray-400">Selecciona una receta y usa &quot;Producir Lote&quot; para crear uno</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Receta</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right">Cantidad</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right">Costo Real</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(l => (
                    <tr key={l.id} className="border-b border-gray-50 dark:border-white/5">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{l.receta?.nombre ?? l.recetaId}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{l.cantidad}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(l.costoReal)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{formatDate(l.producidoEn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/5">
                <p className="text-xs text-gray-500">{lotes.length} lotes — Pag. {page}/{totalPages}</p>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
