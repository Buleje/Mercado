"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, X, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  FileText, User, Calendar, Printer, Send, Check, XCircle, ShoppingCart,
  Trash2, Hash, Bookmark, Copy, List, Clock, MessageCircle, RefreshCw, BarChart3 } from "lucide-react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import ClienteFormModal from "./clientes/ClienteFormModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type CotizacionStatus = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "VENCIDA" | "CONVERTIDA";

type CotizacionItem = {
  id?: string;
  descripcion: string;
  cantidad: number;
  precioUnit: number;
  descuento: number;
  subtotal: number;
  productoId?: string;
};

type Cotizacion = {
  id: string;
  numero: number;
  clienteNombre: string;
  clienteRuc?: string;
  customerId?: string;
  subtotal: number;
  igv: number;
  total: number;
  status: CotizacionStatus;
  validoHasta: string;
  notas?: string;
  items: CotizacionItem[];
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<CotizacionStatus, { label: string; color: string; bg: string }> = {
  BORRADOR:   { label: "Borrador",   color: "text-gray-700 dark:text-gray-400",      bg: "bg-gray-100 dark:bg-gray-800/50" },
  ENVIADA:    { label: "Enviada",    color: "text-blue-700 dark:text-blue-400",      bg: "bg-blue-100 dark:bg-blue-900/30" },
  ACEPTADA:   { label: "Aceptada",   color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  RECHAZADA:  { label: "Rechazada",  color: "text-red-700 dark:text-red-400",        bg: "bg-red-100 dark:bg-red-900/30" },
  VENCIDA:    { label: "Vencida",    color: "text-red-700 dark:text-red-400",        bg: "bg-red-100 dark:bg-red-900/30" },
  CONVERTIDA: { label: "Convertida", color: "text-purple-700 dark:text-purple-400",  bg: "bg-purple-100 dark:bg-purple-900/30" },
};

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const PER_PAGE = 10;

// ── Mejora 17: Preview de documento al hover ────────────────────────────────

function CotizacionPreview({ cotizacion }: { cotizacion: Cotizacion }) {
  const meta = STATUS_META[cotizacion.status];
  return (
    <div className="w-[300px] bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-gray-500">COT-{String(cotizacion.numero).padStart(4, "0")}</span>
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold", meta.bg, meta.color)}>{meta.label}</span>
      </div>
      <p className="font-bold text-gray-900 dark:text-white text-sm">{cotizacion.clienteNombre}</p>
      {cotizacion.clienteRuc && <p className="text-[10px] text-gray-400">RUC: {cotizacion.clienteRuc}</p>}
      <div className="border-t border-gray-100 dark:border-white/5 pt-2">
        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Items</p>
        {cotizacion.items.slice(0, 3).map((it, i) => (
          <p key={i} className="text-xs text-gray-600 dark:text-gray-300 truncate">{it.cantidad}x {it.descripcion}</p>
        ))}
        {cotizacion.items.length > 3 && <p className="text-[10px] text-gray-400">y {cotizacion.items.length - 3} mas...</p>}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-white/5">
        <span className="text-xs text-gray-500">{formatDate(cotizacion.createdAt)}</span>
        <span className="font-bold text-sm text-[#00B4A6]">{formatCurrency(cotizacion.total)}</span>
      </div>
    </div>
  );
}

function HoverPreviewRow({ children, preview }: { children: React.ReactNode; preview: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleEnter = () => {
    const t = setTimeout(() => setShow(true), 300);
    setTimer(t);
  };
  const handleLeave = () => {
    if (timer) clearTimeout(timer);
    setShow(false);
  };
  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          {preview}
        </div>
      )}
    </div>
  );
}

// ── New item row type ─────────────────────────────────────────────────────────
type DraftItem = { descripcion: string; cantidad: string; precioUnit: string; descuento: string };
const emptyItem = (): DraftItem => ({ descripcion: "", cantidad: "1", precioUnit: "", descuento: "0" });

// ── Template types ───────────────────────────────────────────────────────────
type PlantillaItem = { descripcion: string; cantidad: number; precioUnit: number };
type Plantilla = { id: string; nombre: string; items: PlantillaItem[]; createdAt: string };

const TEMPLATES_KEY = "cotizacion_templates";
const MAX_TEMPLATES = 10;

function loadTemplates(): Plantilla[] {
  try {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveTemplates(templates: Plantilla[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
}

// ── Cotizaciones Dashboard ────────────────────────────────────────────────────

function CotizacionesDashboard({ cotizaciones, loading: parentLoading }: { cotizaciones: Cotizacion[]; loading: boolean }) {
  if (parentLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />)}
        </div>
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
    );
  }

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // KPIs
  const emitidasMes = cotizaciones.filter(c => c.createdAt.startsWith(mesActual)).length;
  const convertidas = cotizaciones.filter(c => c.status === "CONVERTIDA").length;
  const tasaConversion = cotizaciones.length > 0 ? (convertidas / cotizaciones.length) * 100 : 0;
  const montoCotizado = cotizaciones.reduce((s, c) => s + c.total, 0);

  // Funnel
  const stages = [
    { id: "BORRADOR", label: "Borrador", count: cotizaciones.filter(c => c.status === "BORRADOR").length, bg: "bg-gray-300 dark:bg-gray-600", text: "text-gray-700 dark:text-gray-300" },
    { id: "ENVIADA", label: "Enviada", count: cotizaciones.filter(c => c.status === "ENVIADA").length, bg: "bg-blue-300 dark:bg-blue-800", text: "text-blue-800 dark:text-blue-200" },
    { id: "ACEPTADA", label: "Aceptada", count: cotizaciones.filter(c => c.status === "ACEPTADA").length, bg: "bg-emerald-300 dark:bg-emerald-800", text: "text-emerald-800 dark:text-emerald-200" },
    { id: "CONVERTIDA", label: "Convertida", count: cotizaciones.filter(c => c.status === "CONVERTIDA").length, bg: "bg-amber-300 dark:bg-amber-800", text: "text-amber-800 dark:text-amber-200" },
  ];
  const maxFunnel = Math.max(...stages.map(s => s.count), 1);

  // AreaChart: cotizaciones por mes (6 meses)
  const monthlyData: { mes: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-PE", { month: "short" });
    const count = cotizaciones.filter(c => c.createdAt.startsWith(mesKey)).length;
    monthlyData.push({ mes: label, count });
  }

  // Top 5 clientes por monto
  const clienteMap = new Map<string, number>();
  for (const c of cotizaciones) {
    const name = c.clienteNombre.length > 15 ? c.clienteNombre.slice(0, 13) + "..." : c.clienteNombre;
    clienteMap.set(name, (clienteMap.get(name) ?? 0) + c.total);
  }
  const topClientes = Array.from(clienteMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, monto]) => ({ name, monto }));

  const emptyCot = (msg: string) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-surface flex items-center justify-center mb-3">
        <BarChart3 className="h-6 w-6 text-gray-400 dark:text-muted" />
      </div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{msg}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Los datos apareceran cuando crees cotizaciones</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 * 0.1 }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Emitidas mes", value: String(emitidasMes), border: "border-b-4 border-blue-500" },
          { label: "Convertidas", value: String(convertidas), border: "border-b-4 border-purple-500" },
          { label: "Tasa conversion", value: `${tasaConversion.toFixed(1)}%`, border: tasaConversion > 30 ? "border-b-4 border-emerald-500" : "border-b-4 border-amber-500" },
          { label: "Monto cotizado", value: formatCurrency(montoCotizado), border: "border-b-4 border-[#00B4A6]" },
        ].map(k => (
          <div key={k.label} className={cn("bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 shadow-sm", k.border)}>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{k.label}</p>
            <p className="text-2xl font-mono font-bold mt-1 text-gray-900 dark:text-white">{k.value}</p>
          </div>
        ))}
      </div>
      </motion.div>

      {/* Funnel */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 * 0.1 }}>
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Funnel de conversion</h3>
        {cotizaciones.length > 0 ? (
          <div className="space-y-2.5">
            {stages.map((stage, i) => {
              const widthPct = Math.max(15, (stage.count / maxFunnel) * 100);
              const prevCount = i > 0 ? stages[i - 1].count : 0;
              const convPct = prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : 0;
              return (
                <div key={stage.id} className="flex items-center gap-3">
                  <div className={cn("rounded-lg px-3 py-2 text-xs font-bold transition-all", stage.bg, stage.text)} style={{ width: `${widthPct}%`, minWidth: "fit-content" }}>
                    {stage.label} ({stage.count})
                  </div>
                  {i > 0 && prevCount > 0 && <span className="text-[10px] text-gray-400 shrink-0">{convPct}%</span>}
                </div>
              );
            })}
          </div>
        ) : emptyCot("Sin cotizaciones para analizar")}
      </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 * 0.1 }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AreaChart: cotizaciones emitidas por mes */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Cotizaciones por mes</h3>
          {monthlyData.some(d => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="cotGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#457b9d" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#457b9d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={((v: number) => [`${v} cotizaciones`, "Emitidas"]) as any} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
                <Area type="monotone" dataKey="count" stroke="#457b9d" fill="url(#cotGrad)" strokeWidth={2} dot={{ r: 3, fill: "#457b9d" }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : emptyCot("Sin cotizaciones en los ultimos meses")}
        </div>

        {/* Top 5 clientes */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Top 5 clientes por monto</h3>
          {topClientes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topClientes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                <XAxis type="number" tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} />
                <Tooltip formatter={((v: number) => [formatCurrency(Number(v)), "Cotizado"]) as any} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
                <Bar dataKey="monto" fill="#00B4A6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : emptyCot("Sin datos de clientes")}
        </div>
      </div>
      </motion.div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CotizacionesModule() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "lista" | "nueva">("dashboard");

  // ── LIST STATE ──
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CotizacionStatus | "">("");
  const [page, setPage] = useState(1);
  // Mejora 13 (R3): Toggle vista Lista/Cards
  const [cotViewMode, setCotViewMode] = useState<"lista" | "cards">(() => {
    if (typeof window === "undefined") return "lista";
    return (localStorage.getItem("cot-view-mode") as "lista" | "cards") || "lista";
  });
  useEffect(() => { localStorage.setItem("cot-view-mode", cotViewMode); }, [cotViewMode]);

  // ── DETAIL ──
  const [selected, setSelected] = useState<Cotizacion | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // ── NEW FORM STATE (multi-step) ──
  const [step, setStep] = useState(1);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteRuc, setClienteRuc] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [validoHasta, setValidoHasta] = useState("");
  const [notas, setNotas] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Product search for autocomplete
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  // ── TEMPLATES ──
  const [templates, setTemplates] = useState<Plantilla[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateList, setShowTemplateList] = useState(false);

  // Load templates on mount
  useEffect(() => { setTemplates(loadTemplates()); }, []);

  // Debounce search (250ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch list ──────────────────────────────────────────────────────────────

  const fetchCotizaciones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/cotizaciones?${params}`);
      if (!res.ok) throw new Error("Error al cargar cotizaciones");
      const data: Cotizacion[] = await res.json();
      setCotizaciones(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => { fetchCotizaciones(); }, [fetchCotizaciones]);

  // UX Mejora 13: Cerrar modales con Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) { setSelected(null); return; }
      if (activeTab === "nueva") { setActiveTab("lista"); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [selected, activeTab]);

  // ── Detail ──────────────────────────────────────────────────────────────────

  const openDetail = async (c: Cotizacion) => {
    setSelected(c);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/${c.id}`);
      if (res.ok) setSelected(await res.json());
    } catch { /* use list data */ } finally { setDetailLoading(false); }
  };

  // ── Status actions ──────────────────────────────────────────────────────────

  const updateStatus = async (status: CotizacionStatus) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      const updated: Cotizacion = await res.json();
      setSelected(updated);
      fetchCotizaciones();
    } catch { /* ignore */ } finally { setActionLoading(false); }
  };

  const convertirAOrden = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/${selected.id}/convertir`, { method: "POST" });
      if (!res.ok) throw new Error("Error al convertir");
      setSelected({ ...selected, status: "CONVERTIDA" });
      fetchCotizaciones();
    } catch { /* ignore */ } finally { setActionLoading(false); }
  };

  // ── Product autocomplete ────────────────────────────────────────────────────

  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&limit=5`);
        if (res.ok) setProductResults(await res.json());
      } catch { setProductResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // ── Create cotización ───────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError(null);
    if (!clienteNombre.trim()) { setCreateError("Nombre del cliente requerido"); return; }
    if (!validoHasta) { setCreateError("Fecha de validez requerida"); return; }
    const parsedItems = items.map(i => ({
      descripcion: i.descripcion,
      cantidad: parseFloat(i.cantidad) || 0,
      precioUnit: parseFloat(i.precioUnit) || 0,
      descuento: parseFloat(i.descuento) || 0,
    })).filter(i => i.descripcion.trim() && i.cantidad > 0 && i.precioUnit > 0);
    if (parsedItems.length === 0) { setCreateError("Agrega al menos un item válido"); return; }

    setCreating(true);
    try {
      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteNombre: clienteNombre.trim(),
          clienteRuc: clienteRuc.trim() || undefined,
          validoHasta: new Date(validoHasta).toISOString(),
          items: parsedItems,
          notas: notas.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : "Error al crear cotización");
      }
      // Reset form
      setClienteNombre(""); setClienteRuc(""); setItems([emptyItem()]); setValidoHasta(""); setNotas("");
      setStep(1);
      setActiveTab("lista");
      fetchCotizaciones();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  // ── Item helpers ────────────────────────────────────────────────────────────

  const updateItem = (idx: number, field: keyof DraftItem, value: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const selectProduct = (idx: number, p: { id: string; name: string; price: number }) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, descripcion: p.name, precioUnit: String(p.price) } : it));
    setProductSearch("");
    setProductResults([]);
    setActiveItemIdx(null);
  };

  // ── Mejora 20: Cotizaciones vencidas ──────────────────────────────────────
  const vencidas = useMemo(() =>
    cotizaciones.filter(c => c.status === "ENVIADA" && new Date(c.validoHasta) < new Date()),
    [cotizaciones]
  );
  const [markingVencidas, setMarkingVencidas] = useState(false);
  const marcarVencidas = async () => {
    setMarkingVencidas(true);
    try {
      await Promise.all(vencidas.map(c =>
        fetch(`/api/cotizaciones/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "VENCIDA" }),
        })
      ));
      fetchCotizaciones();
    } catch { /* ignore */ } finally { setMarkingVencidas(false); }
  };

  // ── Computed totals ─────────────────────────────────────────────────────────

  const computedSubtotal = items.reduce((s, i) => {
    const qty = parseFloat(i.cantidad) || 0;
    const price = parseFloat(i.precioUnit) || 0;
    const desc = (parseFloat(i.descuento) || 0) / 100;
    return s + qty * price * (1 - desc);
  }, 0);
  const computedIgv = computedSubtotal * 0.18;
  const computedTotal = computedSubtotal + computedIgv;

  // ── Pagination ──────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(cotizaciones.length / PER_PAGE));
  const paginated = cotizaciones.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // ── Print ───────────────────────────────────────────────────────────────────

  const handlePrint = () => window.print();

  // ── Template handlers ─────────────────────────────────────────────────────

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    const current = selected;
    if (!current) return;

    const templateItems: PlantillaItem[] = (current.items ?? []).map(it => ({
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precioUnit: it.precioUnit,
    }));

    if (templateItems.length === 0) return;

    const newTemplate: Plantilla = {
      id: `tpl_${Date.now()}`,
      nombre: templateName.trim(),
      items: templateItems,
      createdAt: new Date().toISOString(),
    };

    const updated = [newTemplate, ...templates].slice(0, MAX_TEMPLATES);
    setTemplates(updated);
    saveTemplates(updated);
    setShowSaveTemplate(false);
    setTemplateName("");
  };

  const handleLoadTemplate = (tpl: Plantilla) => {
    setItems(tpl.items.map(it => ({
      descripcion: it.descripcion,
      cantidad: String(it.cantidad),
      precioUnit: String(it.precioUnit),
      descuento: "0",
    })));
    setShowTemplateModal(false);
    setActiveTab("nueva");
    if (step !== 2) setStep(2);
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — Mejora 20 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-[#00B4A6] text-white flex items-center justify-center shadow-sm shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Cotizaciones
              {/* Mejora 20 (R3): Badge de estado */}
              {!loading && cotizaciones.length > 0 && (() => {
                const pendientes = cotizaciones.filter(c => c.status === "BORRADOR" || c.status === "ENVIADA").length;
                return pendientes > 0 ? (
                  <span className="ml-2 text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full align-middle">{pendientes} pendientes</span>
                ) : null;
              })()}
            </h1>
            <p className="text-sm text-gray-500">Presupuestos profesionales para tus clientes</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-white/5 rounded-xl p-1 w-fit">
        {([["dashboard", "Dashboard"], ["lista", "Lista"], ["nueva", "Nueva Cotización"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5",
              activeTab === id
                ? "bg-white dark:bg-card text-[#00B4A6] shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            {id === "dashboard" && <BarChart3 className="h-3.5 w-3.5" />}
            {label}
            {id === "lista" && cotizaciones.length > 0 && (
              <span className="bg-gray-200 dark:bg-gray-700 text-[9px] px-1.5 rounded-full">{cotizaciones.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: DASHBOARD ──────────────────────────────────────────────── */}
      {activeTab === "dashboard" && <CotizacionesDashboard cotizaciones={cotizaciones} loading={loading} />}

      {/* ── TAB: LISTA ──────────────────────────────────────────────────── */}
      {activeTab === "lista" && (
        <>
          {/* Mejora M9: KPIs de tasa de conversion */}
          {!loading && cotizaciones.length > 0 && (() => {
            const total = cotizaciones.length;
            const convertidas = cotizaciones.filter(c => c.status === "CONVERTIDA").length;
            const tasaConversion = total > 0 ? (convertidas / total) * 100 : 0;
            const montoTotal = cotizaciones.reduce((s, c) => s + c.total, 0);

            // Tendencia mensual
            const now = new Date();
            const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const mesAnterior = (() => { const d = new Date(now); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
            const cotsMesActual = cotizaciones.filter(c => c.createdAt.startsWith(mesActual));
            const cotsMesAnterior = cotizaciones.filter(c => c.createdAt.startsWith(mesAnterior));
            const convMesActual = cotsMesActual.filter(c => c.status === "CONVERTIDA").length;
            const convMesAnterior = cotsMesAnterior.filter(c => c.status === "CONVERTIDA").length;
            const tasaMesActual = cotsMesActual.length > 0 ? (convMesActual / cotsMesActual.length) * 100 : 0;
            const tasaMesAnterior = cotsMesAnterior.length > 0 ? (convMesAnterior / cotsMesAnterior.length) * 100 : 0;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Total cotizaciones</p>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-white">{total}</p>
                </div>
                <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Convertidas</p>
                  <p className="text-lg font-extrabold text-purple-600 dark:text-purple-400">{convertidas}</p>
                </div>
                <div className={cn(
                  "bg-white dark:bg-card border rounded-xl p-3",
                  tasaConversion > 30 ? "border-emerald-200 dark:border-emerald-800" :
                  tasaConversion >= 15 ? "border-amber-200 dark:border-amber-800" :
                  "border-red-200 dark:border-red-800"
                )}>
                  <p className="text-[10px] uppercase font-bold text-gray-400">Tasa conversion</p>
                  <p className={cn("text-lg font-extrabold",
                    tasaConversion > 30 ? "text-emerald-600" :
                    tasaConversion >= 15 ? "text-amber-600" :
                    "text-red-600"
                  )}>
                    {tasaConversion.toFixed(1)}%
                  </p>
                  {cotsMesAnterior.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Este mes: {tasaMesActual.toFixed(0)}% vs anterior: {tasaMesAnterior.toFixed(0)}%
                      {tasaMesActual > tasaMesAnterior ? " ↑" : tasaMesActual < tasaMesAnterior ? " ↓" : ""}
                    </p>
                  )}
                </div>
                <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Monto cotizado</p>
                  <p className="text-lg font-extrabold text-[#00B4A6]">{formatCurrency(montoTotal)}</p>
                </div>
              </div>
            );
          })()}

          {/* Mejora nueva: Funnel de conversion */}
          {!loading && cotizaciones.length > 0 && (() => {
            const stages = [
              { id: "BORRADOR", label: "Borrador", count: cotizaciones.filter(c => c.status === "BORRADOR").length, bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-700 dark:text-gray-300" },
              { id: "ENVIADA", label: "Enviada", count: cotizaciones.filter(c => c.status === "ENVIADA").length, bg: "bg-blue-200 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
              { id: "ACEPTADA", label: "Aceptada", count: cotizaciones.filter(c => c.status === "ACEPTADA").length, bg: "bg-emerald-200 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
              { id: "CONVERTIDA", label: "Convertida", count: cotizaciones.filter(c => c.status === "CONVERTIDA").length, bg: "bg-amber-200 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
            ];
            const maxCount = Math.max(...stages.map(s => s.count), 1);
            return (
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] uppercase font-bold text-gray-400 mb-3">Funnel de conversion</p>
                <div className="space-y-2">
                  {stages.map((stage, i) => {
                    const widthPct = Math.max(15, (stage.count / maxCount) * 100);
                    const prevCount = i > 0 ? stages[i - 1].count : 0;
                    const convPct = prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : 0;
                    return (
                      <div key={stage.id} className="flex items-center gap-3">
                        <div
                          className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition-all", stage.bg, stage.text)}
                          style={{ width: `${widthPct}%`, minWidth: "fit-content" }}
                        >
                          {stage.label} ({stage.count})
                        </div>
                        {i > 0 && prevCount > 0 && (
                          <span className="text-[10px] text-gray-400 shrink-0">{convPct}%</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 flex gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por cliente..."
                  aria-label="Buscar cotizaciones"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowQuickClient(true)}
                className="shrink-0 h-[38px] w-[38px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#00B4A6] hover:text-white hover:border-[#00B4A6] text-gray-500 transition-colors"
                title="Crear cliente rapido"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {(["", "BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA", "VENCIDA", "CONVERTIDA"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors",
                    statusFilter === s
                      ? "bg-[#00B4A6] text-white"
                      : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
                  )}
                >
                  {s === "" ? "Todos" : STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Mejora 10: Alerta cotizaciones vencidas mejorada */}
          <AnimatePresence>
            {vencidas.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-xl"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-red-800 dark:text-red-300">
                      {vencidas.length} cotizacion{vencidas.length > 1 ? "es" : ""} vencieron sin respuesta
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-2">
                      {vencidas.slice(0, 3).map(c => `COT-${String(c.numero).padStart(4, "0")} para ${c.clienteNombre} (${formatCurrency(c.total)})`).join(" \u00B7 ")}
                      {vencidas.length > 3 && ` y ${vencidas.length - 3} mas...`}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={async () => {
                          setMarkingVencidas(true);
                          try {
                            for (const c of vencidas) {
                              const newDate = new Date(c.validoHasta);
                              newDate.setDate(newDate.getDate() + 15);
                              await fetch("/api/cotizaciones", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  clienteNombre: c.clienteNombre,
                                  clienteRuc: c.clienteRuc,
                                  validoHasta: newDate.toISOString(),
                                  items: c.items.map(it => ({ descripcion: it.descripcion, cantidad: it.cantidad, precioUnit: it.precioUnit, descuento: it.descuento })),
                                  notas: c.notas,
                                }),
                              });
                            }
                            fetchCotizaciones();
                          } catch { /* ignore */ } finally { setMarkingVencidas(false); }
                        }}
                        disabled={markingVencidas}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {markingVencidas ? "Procesando..." : "Renovar todas"}
                      </button>
                      <button
                        onClick={marcarVencidas}
                        disabled={markingVencidas}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                      >
                        Marcar como vencidas
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#00B4A6]" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <button onClick={fetchCotizaciones} className="text-xs text-[#00B4A6] hover:underline font-semibold mt-1">Reintentar</button>
              </div>
            ) : cotizaciones.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-surface flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-gray-400 dark:text-muted" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin cotizaciones</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Envía presupuestos profesionales a tus clientes</p>
                <button onClick={() => setActiveTab("nueva")} className="bg-[#00B4A6] text-white px-6 py-2.5 rounded-xl font-medium hover:bg-[#009690]">Nueva cotización</button>
              </div>
            ) : (
              <>
                {/* Mejora 13 (R3): Toggle Lista/Cards */}
                <div className="flex items-center gap-1 px-4 pt-2">
                  <button onClick={() => setCotViewMode("lista")} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", cotViewMode === "lista" ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400")}>
                    <List className="h-3.5 w-3.5 inline mr-1" />Lista
                  </button>
                  <button onClick={() => setCotViewMode("cards")} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", cotViewMode === "cards" ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400")}>
                    <Bookmark className="h-3.5 w-3.5 inline mr-1" />Cards
                  </button>
                </div>

                {/* Mejora 13 (R3): Vista Cards */}
                {cotViewMode === "cards" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4 py-2">
                    {paginated.map(c => {
                      const meta = STATUS_META[c.status];
                      const headerColor = c.status === "BORRADOR" ? "bg-gray-100 dark:bg-gray-800" : c.status === "ENVIADA" ? "bg-blue-50 dark:bg-blue-950/30" : c.status === "ACEPTADA" || c.status === "CONVERTIDA" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30";
                      const diasValidez = Math.max(0, Math.ceil((new Date(c.validoHasta).getTime() - Date.now()) / 86400000));
                      return (
                        <div key={c.id} onClick={() => openDetail(c)} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg cursor-pointer transition-all group">
                          <div className={cn("px-4 py-2 flex items-center justify-between", headerColor)}>
                            <span className="font-mono text-xs font-bold text-gray-600 dark:text-gray-300">COT-{String(c.numero).padStart(4, "0")}</span>
                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold", meta.bg, meta.color)}>{meta.label}</span>
                          </div>
                          <div className="p-4 space-y-2">
                            <p className="font-bold text-gray-900 dark:text-white truncate group-hover:text-[#00B4A6] transition-colors">{c.clienteNombre}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-extrabold text-[#00B4A6]">{formatCurrency(c.total)}</span>
                              <span className="text-[10px] text-gray-400">{formatDate(c.createdAt)} · {diasValidez > 0 ? `${diasValidez}d válido` : "Vencida"}</span>
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                              <button onClick={(e) => { e.stopPropagation(); openDetail(c); }} className="flex-1 text-xs font-bold text-[#00B4A6] bg-[#00B4A6]/10 hover:bg-[#00B4A6]/20 py-1.5 rounded-lg transition-colors">Ver</button>
                              <button onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/?text=${encodeURIComponent(`Cotización COT-${String(c.numero).padStart(4, "0")} por ${formatCurrency(c.total)}`)}`, "_blank"); }} className="flex-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 py-1.5 rounded-lg transition-colors">WhatsApp</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full min-w-[600px] sm:min-w-0 text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">N°</th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Cliente</th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right">Total</th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">Válido hasta</th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(c => {
                        const meta = STATUS_META[c.status];
                        return (
                          <tr
                            key={c.id}
                            onClick={() => openDetail(c)}
                            className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors group"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">
                              {/* Mejora 17: Preview al hover */}
                              <HoverPreviewRow preview={<CotizacionPreview cotizacion={c} />}>
                                <span>{String(c.numero).padStart(4, "0")}</span>
                              </HoverPreviewRow>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-[#f97316]/20 flex items-center justify-center shrink-0">
                                  <User className="h-4 w-4 text-[#f97316]" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 dark:text-white truncate">{c.clienteNombre}</p>
                                  {c.clienteRuc && <p className="text-xs text-gray-400 truncate">RUC: {c.clienteRuc}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="num px-4 py-3 font-bold text-gray-900 dark:text-white">{formatCurrency(c.total)}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{formatDate(c.validoHasta)}</td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", meta.bg, meta.color)}>
                                {meta.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/5">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {cotizaciones.length} cotizaci{cotizaciones.length !== 1 ? "ones" : "ón"} — Pág. {page}/{totalPages}
                    </p>
                    <div className="flex gap-1">
                      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── TAB: NUEVA COTIZACIÓN (multi-step) ──────────────────────────── */}
      {activeTab === "nueva" && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm p-5 space-y-5">
          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                  step >= s ? "bg-[#00B4A6] text-white" : "bg-gray-200 dark:bg-white/10 text-gray-500"
                )}>
                  {s}
                </div>
                {s < 3 && <div className={cn("w-8 h-0.5", step > s ? "bg-[#00B4A6]" : "bg-gray-200 dark:bg-white/10")} />}
              </div>
            ))}
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
              {step === 1 ? "Datos del cliente" : step === 2 ? "Items" : "Confirmar"}
            </span>
          </div>

          {/* Step 1: Cliente */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Nombre del cliente</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={clienteNombre}
                    onChange={e => setClienteNombre(e.target.value)}
                    placeholder="Nombre o razón social"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">RUC (opcional)</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={clienteRuc}
                    onChange={e => setClienteRuc(e.target.value)}
                    placeholder="20XXXXXXXXX"
                    maxLength={20}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { if (clienteNombre.trim()) setStep(2); else setCreateError("Nombre del cliente requerido"); }}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] shadow-sm transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Items */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Template buttons */}
              {templates.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#00B4A6] bg-[#00B4A6]/10 hover:bg-[#00B4A6]/20 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" /> Desde plantilla
                  </button>
                  <button
                    onClick={() => setShowTemplateList(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    <List className="h-3.5 w-3.5" /> Gestionar ({templates.length})
                  </button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                      <th className="pb-2 pr-2">Descripción</th>
                      <th className="pb-2 pr-2 w-20">Cant.</th>
                      <th className="pb-2 pr-2 w-24">Precio</th>
                      <th className="pb-2 pr-2 w-20">Desc.%</th>
                      <th className="pb-2 w-24 text-right">Subtotal</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const qty = parseFloat(item.cantidad) || 0;
                      const price = parseFloat(item.precioUnit) || 0;
                      const desc = (parseFloat(item.descuento) || 0) / 100;
                      const sub = qty * price * (1 - desc);
                      return (
                        <tr key={idx} className="border-b border-gray-50 dark:border-white/5">
                          <td className="py-2 pr-2 relative">
                            <input
                              type="text"
                              value={item.descripcion}
                              onChange={e => { updateItem(idx, "descripcion", e.target.value); setProductSearch(e.target.value); setActiveItemIdx(idx); }}
                              onFocus={() => setActiveItemIdx(idx)}
                              placeholder="Buscar producto o escribir..."
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30"
                            />
                            {activeItemIdx === idx && productResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                {productResults.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => selectProduct(idx, p)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 flex justify-between"
                                  >
                                    <span className="truncate">{p.name}</span>
                                    <span className="text-gray-400 ml-2">{formatCurrency(p.price)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" min="1" step="1" value={item.cantidad} onChange={e => updateItem(idx, "cantidad", e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30 text-center" />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" min="0" step="0.01" value={item.precioUnit} onChange={e => updateItem(idx, "precioUnit", e.target.value)}
                              placeholder="0.00"
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30 text-right" />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" min="0" max="100" step="1" value={item.descuento} onChange={e => updateItem(idx, "descuento", e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30 text-center" />
                          </td>
                          <td className="py-2 text-right font-medium text-gray-900 dark:text-white">{formatCurrency(sub)}</td>
                          <td className="py-2 pl-1">
                            {items.length > 1 && (
                              <button onClick={() => removeItem(idx)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-[#00B4A6] hover:underline">
                <Plus className="h-3.5 w-3.5" /> Agregar item
              </button>

              {/* Totals */}
              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-1">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span><span>{formatCurrency(computedSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>IGV (18%)</span><span>{formatCurrency(computedIgv)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white border-t border-gray-200 dark:border-white/10 pt-1">
                  <span>TOTAL</span><span>{formatCurrency(computedTotal)}</span>
                </div>
              </div>

              <div className="flex gap-2 justify-between pt-2">
                <button onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                  Atrás
                </button>
                <button onClick={() => setStep(3)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] shadow-sm transition-colors">
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmar */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
                <p className="text-sm"><span className="font-bold text-gray-700 dark:text-gray-300">Cliente:</span> {clienteNombre} {clienteRuc ? `(RUC: ${clienteRuc})` : ""}</p>
                <p className="text-sm"><span className="font-bold text-gray-700 dark:text-gray-300">Items:</span> {items.filter(i => i.descripcion.trim()).length}</p>
                <p className="text-sm"><span className="font-bold text-gray-700 dark:text-gray-300">Total:</span> <span className="font-bold text-[#00B4A6]">{formatCurrency(computedTotal)}</span></p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Válido hasta</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="date"
                    value={validoHasta}
                    onChange={e => setValidoHasta(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Notas (opcional)</label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Condiciones, observaciones..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30 resize-none"
                />
              </div>

              {createError && <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{createError}</p>}

              <div className="flex gap-2 justify-between pt-1">
                <button onClick={() => setStep(2)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                  Atrás
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 shadow-sm transition-colors"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Crear Cotización
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detail Sheet ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="cot-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <motion.div
              key="cot-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-card border-l border-gray-200 dark:border-card-border shadow-2xl overflow-y-auto"
            >
              <div className="p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cotización #{String(selected.numero).padStart(4, "0")}</h3>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                {/* Info */}
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-[#f97316]/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-[#f97316]" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{selected.clienteNombre}</p>
                      {selected.clienteRuc && <p className="text-xs text-gray-500">RUC: {selected.clienteRuc}</p>}
                    </div>
                    <span className={cn("ml-auto px-2 py-1 rounded-lg text-xs font-bold", STATUS_META[selected.status].bg, STATUS_META[selected.status].color)}>
                      {STATUS_META[selected.status].label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200 dark:border-white/10">
                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Subtotal</p><p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selected.subtotal)}</p></div>
                    <div><p className="text-[10px] uppercase font-bold text-gray-400">IGV</p><p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selected.igv)}</p></div>
                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Total</p><p className="text-sm font-bold text-[#00B4A6]">{formatCurrency(selected.total)}</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Calendar className="h-3.5 w-3.5" />
                    Válido hasta: {formatDate(selected.validoHasta)}
                  </div>
                </div>

                {/* Items */}
                {detailLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#00B4A6]" /></div>
                ) : (
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Items</h4>
                    <div className="space-y-2">
                      {(selected.items ?? []).map((item, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.descripcion}</p>
                            <p className="text-xs text-gray-400">{item.cantidad} x {formatCurrency(item.precioUnit)} {item.descuento > 0 ? `(-${item.descuento}%)` : ""}</p>
                          </div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(item.subtotal)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mejora 5: Timeline de seguimiento */}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Seguimiento</h4>
                  <div className="space-y-0">
                    {([
                      { label: "Creada", status: "BORRADOR" as const, date: selected.createdAt },
                      { label: "Enviada", status: "ENVIADA" as const, date: selected.status !== "BORRADOR" ? selected.updatedAt : null },
                      { label: "Aceptada / Rechazada", status: "ACEPTADA" as const, date: (selected.status === "ACEPTADA" || selected.status === "RECHAZADA") ? selected.updatedAt : null },
                      { label: "Convertida a orden", status: "CONVERTIDA" as const, date: selected.status === "CONVERTIDA" ? selected.updatedAt : null },
                    ] as const).map((step, idx) => {
                      const statusOrder = ["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA", "CONVERTIDA", "VENCIDA"];
                      const currentIdx = statusOrder.indexOf(selected.status);
                      const stepIdx = statusOrder.indexOf(step.status);
                      const isDone = step.status === "BORRADOR" || (step.status === "ACEPTADA" && (selected.status === "ACEPTADA" || selected.status === "RECHAZADA" || selected.status === "CONVERTIDA")) || (currentIdx >= stepIdx && stepIdx > 0) || selected.status === "CONVERTIDA" && step.status === "CONVERTIDA";
                      return (
                        <div key={idx} className="flex gap-3 items-start">
                          <div className="flex flex-col items-center">
                            <div className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px]", isDone ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-gray-100 dark:bg-white/10 text-gray-400")}>
                              {isDone ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            </div>
                            {idx < 3 && <div className={cn("w-0.5 h-6", isDone ? "bg-emerald-200 dark:bg-emerald-800" : "bg-gray-200 dark:bg-white/10")} />}
                          </div>
                          <div className="pb-3">
                            <p className={cn("text-xs font-bold", isDone ? "text-gray-900 dark:text-white" : "text-gray-400")}>{step.label}</p>
                            {step.date && isDone && <p className="text-[10px] text-gray-400">{formatDate(step.date)}</p>}
                            {!isDone && <p className="text-[10px] text-gray-400 italic">pendiente</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Alerta: sin respuesta > 3 días */}
                  {selected.status === "ENVIADA" && (() => {
                    const diasEnviada = Math.floor((Date.now() - new Date(selected.updatedAt).getTime()) / 86400000);
                    const vencida = new Date(selected.validoHasta) < new Date();
                    if (vencida) {
                      return (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-bold text-red-700 dark:text-red-400">Cotización vencida — ¿Renovar?</p>
                          <button
                            onClick={() => {
                              setItems(selected.items.map(it => ({ descripcion: it.descripcion, cantidad: String(it.cantidad), precioUnit: String(it.precioUnit), descuento: String(it.descuento) })));
                              setClienteNombre(selected.clienteNombre);
                              setClienteRuc(selected.clienteRuc || "");
                              const newDate = new Date(); newDate.setDate(newDate.getDate() + 15);
                              setValidoHasta(newDate.toISOString().slice(0, 10));
                              setSelected(null);
                              setActiveTab("nueva");
                              setStep(3);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Renovar cotización
                          </button>
                        </div>
                      );
                    }
                    if (diasEnviada > 3) {
                      const _phone = selected.customerId || "";
                      const waText = `Hola ${selected.clienteNombre}, te enviamos la cotización ${String(selected.numero).padStart(4, "0")} por S/${selected.total.toFixed(2)}. ¿Te interesa?`;
                      return (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Sin respuesta hace {diasEnviada} días — ¿Enviar recordatorio?</p>
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#25D366] hover:bg-[#1da851] transition-colors"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Recordar por WhatsApp
                          </a>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Action buttons based on status */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {selected.status === "BORRADOR" && (
                    <>
                      <button onClick={() => updateStatus("ENVIADA")} disabled={actionLoading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        <Send className="h-4 w-4" /> Enviar
                      </button>
                    </>
                  )}
                  {selected.status === "ENVIADA" && (
                    <>
                      <button onClick={() => updateStatus("ACEPTADA")} disabled={actionLoading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                        <Check className="h-4 w-4" /> Aceptada
                      </button>
                      <button onClick={() => updateStatus("RECHAZADA")} disabled={actionLoading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                        <XCircle className="h-4 w-4" /> Rechazada
                      </button>
                    </>
                  )}
                  {selected.status === "ACEPTADA" && (
                    <button onClick={convertirAOrden} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors">
                      <ShoppingCart className="h-4 w-4" /> Convertir a Orden
                    </button>
                  )}
                  {/* Mejora M10: Enviar cotizacion por WhatsApp */}
                  <button
                    onClick={() => {
                      const c = selected;
                      const itemsText = (c.items ?? []).map((it, i) =>
                        `${i + 1}. ${it.descripcion} x ${it.cantidad} — S/ ${it.subtotal.toFixed(2)}`
                      ).join("\n");
                      const texto = [
                        `*Cotizacion #${String(c.numero).padStart(4, "0")} — Buleje*`,
                        `Cliente: ${c.clienteNombre}`,
                        `Fecha: ${formatDate(c.createdAt)}`,
                        `Valida hasta: ${formatDate(c.validoHasta)}`,
                        `─────────`,
                        itemsText,
                        `─────────`,
                        `Subtotal: S/ ${c.subtotal.toFixed(2)}`,
                        `IGV (18%): S/ ${c.igv.toFixed(2)}`,
                        `*Total: S/ ${c.total.toFixed(2)}*`,
                        `─────────`,
                        `Te interesa? Responde a este mensaje.`,
                        `Buleje — Pucallpa`,
                      ].join("\n");
                      const encodedText = encodeURIComponent(texto);
                      const phone = (c.customerId || "").replace(/\D/g, "");
                      const url = phone ? `https://wa.me/${phone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
                      window.open(url, "_blank");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#25D366] hover:bg-[#1da851] transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </button>
                  {/* Mejora 6: Duplicar cotización */}
                  <button
                    onClick={() => {
                      setItems(selected.items.map(it => ({ descripcion: it.descripcion, cantidad: String(it.cantidad), precioUnit: String(it.precioUnit), descuento: String(it.descuento) })));
                      setClienteNombre("");
                      setClienteRuc("");
                      const newDate = new Date(); newDate.setDate(newDate.getDate() + 15);
                      setValidoHasta(newDate.toISOString().slice(0, 10));
                      setNotas("");
                      setSelected(null);
                      setActiveTab("nueva");
                      setStep(2);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-[#f97316] bg-[#f97316]/10 hover:bg-[#f97316]/20 transition-colors"
                  >
                    <Copy className="h-4 w-4" /> Duplicar
                  </button>
                  <button onClick={handlePrint}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                    <Printer className="h-4 w-4" /> Imprimir PDF
                  </button>
                  <button
                    onClick={() => { setShowSaveTemplate(true); setTemplateName(""); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-[#00B4A6] bg-[#00B4A6]/10 hover:bg-[#00B4A6]/20 transition-colors"
                  >
                    <Bookmark className="h-4 w-4" /> Guardar como plantilla
                  </button>
                </div>

                {/* Save as template mini-modal */}
                {showSaveTemplate && (
                  <div className="bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 border border-[#00B4A6]/20 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Guardar como plantilla</p>
                    <input
                      type="text"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      placeholder="Nombre de la plantilla..."
                      maxLength={60}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                      onKeyDown={e => e.key === "Enter" && handleSaveTemplate()}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowSaveTemplate(false)}
                        className="flex-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveTemplate}
                        disabled={!templateName.trim()}
                        className="flex-1 px-3 py-2 rounded-xl text-xs font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 transition-colors"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Template Selection Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {showTemplateModal && (
          <>
            <motion.div
              key="tpl-select-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowTemplateModal(false)}
            />
            <motion.div
              key="tpl-select-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowTemplateModal(false)}
            >
              <div className="w-full max-w-md bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Seleccionar plantilla</h3>
                  <button onClick={() => setShowTemplateModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
                {templates.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No hay plantillas guardadas</p>
                ) : (
                  <div className="space-y-2">
                    {templates.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => handleLoadTemplate(tpl)}
                        className="w-full text-left p-3 bg-gray-50 dark:bg-white/5 rounded-xl hover:bg-[#00B4A6]/5 dark:hover:bg-[#00B4A6]/10 hover:border-[#00B4A6]/20 border border-transparent transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[#00B4A6]/10 flex items-center justify-center shrink-0">
                            <Bookmark className="h-4 w-4 text-[#00B4A6]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{tpl.nombre}</p>
                            <p className="text-[10px] text-gray-400">
                              {tpl.items.length} item{tpl.items.length !== 1 ? "s" : ""} &middot; {formatDate(tpl.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Template Management Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {showTemplateList && (
          <>
            <motion.div
              key="tpl-manage-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowTemplateList(false)}
            />
            <motion.div
              key="tpl-manage-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowTemplateList(false)}
            >
              <div className="w-full max-w-md bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Plantillas guardadas</h3>
                  <button onClick={() => setShowTemplateList(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
                <p className="text-xs text-gray-400">{templates.length} de {MAX_TEMPLATES} plantillas usadas</p>
                {templates.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No hay plantillas. Guarda una desde una cotizacion existente.</p>
                ) : (
                  <div className="space-y-2">
                    {templates.map(tpl => (
                      <div
                        key={tpl.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-xl"
                      >
                        <div className="h-8 w-8 rounded-lg bg-[#00B4A6]/10 flex items-center justify-center shrink-0">
                          <Bookmark className="h-4 w-4 text-[#00B4A6]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{tpl.nombre}</p>
                          <p className="text-[10px] text-gray-400">
                            {tpl.items.length} item{tpl.items.length !== 1 ? "s" : ""} &middot; {formatDate(tpl.createdAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleLoadTemplate(tpl)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold text-[#00B4A6] bg-[#00B4A6]/10 hover:bg-[#00B4A6]/20 transition-colors shrink-0"
                        >
                          Usar
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tpl.id)}
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick client creation modal */}
      <ClienteFormModal
        isOpen={showQuickClient}
        onClose={() => setShowQuickClient(false)}
        onSaved={() => setShowQuickClient(false)}
        initialFormat="simple"
      />
    </div>
  );
}
