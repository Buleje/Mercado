"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users, Search, X, Download, Loader2, AlertCircle,
  Phone, Crown, Star, UserPlus, Moon,
  ShoppingCart, TrendingUp, UserCheck,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, exportToCSV } from "@/lib/utils";
import Customer360Tab from "./Customer360Tab";

// ── Types ──────────────────────────────────────────────────────────────────

type Customer = {
  phone: string;
  name: string;
  location?: string;
  loyaltyTier?: string;
  totalSpent?: number;
  loyaltyPoints?: number;
  // Populated client-side from /orders
  _orderCount?: number;
  _lastOrder?: string | null;
  _segment?: Segment;
};

type Segment = "frecuente" | "ocasional" | "nuevo" | "perdido";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRelative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

function inferSegment(c: Customer): Segment {
  if ((c._orderCount ?? 0) === 0) return "nuevo";
  if (c._lastOrder) {
    const days = Math.floor((Date.now() - new Date(c._lastOrder).getTime()) / 86400000);
    if (days > 90) return "perdido";
  }
  if ((c._orderCount ?? 0) >= 5) return "frecuente";
  if ((c._orderCount ?? 0) >= 2) return "ocasional";
  return "nuevo";
}

// ── Config ─────────────────────────────────────────────────────────────────

const SEGMENT_CONFIG: Record<Segment, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  frecuente: { label: "Frecuente", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-300 dark:border-emerald-700", Icon: Crown },
  ocasional: { label: "Ocasional", color: "text-blue-700 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/30",     border: "border-blue-300 dark:border-blue-700",     Icon: Star },
  nuevo:     { label: "Nuevo",     color: "text-violet-700 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-300 dark:border-violet-700", Icon: UserPlus },
  perdido:   { label: "Perdido",   color: "text-red-700 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-950/30",       border: "border-red-300 dark:border-red-700",       Icon: Moon },
};

const PAGE_SIZE = 25;

// ── Component ──────────────────────────────────────────────────────────────

export default function CRMTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);

  const [search, setSearch]           = useState("");
  const [filterSegment, setFilterSegment] = useState<Segment | "todos">("todos");
  const [page, setPage]               = useState(1);

  const [detail, setDetail] = useState<string | null>(null); // phone

  // ── Load customers ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/customers?limit=500");
      if (!res.ok) throw new Error("fetch failed");
      const data: Customer[] = await res.json();
      // Annotate with inferred segment (lightweight — no per-customer fetch)
      const annotated = data.map(c => ({ ...c, _segment: inferSegment(c) }));
      setCustomers(annotated);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const total     = customers.length;
    const activos   = customers.filter(c => c._lastOrder && new Date(c._lastOrder).getTime() > thirtyDaysAgo).length;
    const nuevos    = customers.filter(c => c._segment === "nuevo").length;
    const clvProm   = total > 0 ? customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0) / total : 0;
    return { total, activos, nuevos, clvProm };
  }, [customers]);

  const segmentCounts = useMemo(() => {
    const counts: Record<Segment, number> = { frecuente: 0, ocasional: 0, nuevo: 0, perdido: 0 };
    for (const c of customers) counts[c._segment ?? "nuevo"]++;
    return counts;
  }, [customers]);

  const filtered = useMemo(() => {
    let list = [...customers];
    if (filterSegment !== "todos") list = list.filter(c => c._segment === filterSegment);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [customers, filterSegment, search]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filterSegment]);

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-400 dark:text-muted">Cargando clientes…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="font-bold text-gray-700 dark:text-foreground">Error al cargar clientes</p>
        <button onClick={load} className="text-sm text-primary hover:underline">Reintentar</button>
      </div>
    );
  }

  // ── Customer360 modal ─────────────────────────────────────────────────────

  if (detail) {
    return (
      <AnimatePresence>
        <motion.div
          key="360"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
        >
          <Customer360Tab phone={detail} onClose={() => setDetail(null)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> CRM — Clientes
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión y seguimiento de todos tus clientes</p>
        </div>
        <button
          onClick={() => exportToCSV(
            customers.map(c => ({ nombre: c.name, telefono: c.phone, ubicacion: c.location ?? "", gastado: c.totalSpent ?? 0, segmento: c._segment ?? "nuevo" })),
            "crm-clientes"
          )}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total clientes",   value: String(stats.total),   icon: Users,       color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Activos (30d)",    value: String(stats.activos), icon: UserCheck,   color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Nuevos",           value: String(stats.nuevos),  icon: UserPlus,    color: "text-violet-500",  bg: "bg-violet-50 dark:bg-violet-950/30" },
          { label: "CLV promedio",     value: fmt(stats.clvProm),    icon: TrendingUp,  color: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-950/30" },
        ].map(k => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("rounded-2xl p-4", k.bg)}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon className={cn("h-4 w-4", k.color)} />
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            </div>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Segment pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterSegment("todos")}
          className={cn("px-3 py-1.5 rounded-full text-sm font-bold border transition-colors",
            filterSegment === "todos"
              ? "bg-primary text-white border-primary"
              : "border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
          )}
        >
          Todos · {customers.length}
        </button>
        {(Object.entries(SEGMENT_CONFIG) as [Segment, typeof SEGMENT_CONFIG[Segment]][]).map(([seg, cfg]) => {
          const Icon = cfg.Icon;
          const active = filterSegment === seg;
          return (
            <button
              key={seg}
              onClick={() => setFilterSegment(seg)}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border transition-colors",
                active
                  ? "bg-primary text-white border-primary"
                  : cn(cfg.bg, cfg.color, cfg.border, "hover:opacity-80")
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label} · {segmentCounts[seg]}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nombre o teléfono…"
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-foreground" />
            </button>
          )}
        </div>
        <p className="self-center text-xs text-gray-400 dark:text-muted">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Teléfono</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Último pedido</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Total gastado</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Segmento</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-card-border">
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-muted">
                      <Users className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No se encontraron clientes</p>
                      {(search || filterSegment !== "todos") && (
                        <button onClick={() => { setSearch(""); setFilterSegment("todos"); }} className="text-xs text-primary hover:underline">
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {paginated.map(c => {
                const seg = c._segment ?? "nuevo";
                const cfg = SEGMENT_CONFIG[seg];
                const Icon = cfg.Icon;
                return (
                  <motion.tr
                    key={c.phone}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors"
                  >
                    {/* Nombre */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-extrabold text-primary shrink-0 select-none">
                          {c.name.split(" ").slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("")}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-foreground">{c.name}</p>
                          {c.location && <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{c.location}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Teléfono */}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-muted">
                        <Phone className="h-3 w-3" />{c.phone}
                      </span>
                    </td>

                    {/* Último pedido */}
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-muted hidden sm:table-cell">
                      {c._lastOrder ? fmtRelative(c._lastOrder) : "—"}
                    </td>

                    {/* Total gastado */}
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-foreground hidden md:table-cell">
                      {fmt(c.totalSpent ?? 0)}
                    </td>

                    {/* Segmento */}
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", cfg.bg, cfg.color, cfg.border)}>
                        <Icon className="h-2.5 w-2.5" />{cfg.label}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDetail(c.phone)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold transition-colors"
                      >
                        <ShoppingCart className="h-3 w-3" />360°
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-card-border bg-gray-50 dark:bg-surface">
            <p className="text-xs text-gray-400 dark:text-muted">
              Página {page} de {totalPages} · {filtered.length} clientes
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-card-border hover:bg-white dark:hover:bg-card disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-gray-500 dark:text-muted" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i));
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn("w-8 h-8 text-xs rounded-lg font-semibold transition-colors",
                      page === p
                        ? "bg-primary text-white"
                        : "border border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-white dark:hover:bg-card"
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-card-border hover:bg-white dark:hover:bg-card disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-gray-500 dark:text-muted" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
