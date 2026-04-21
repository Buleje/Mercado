"use client";

import { CardTitle, LoadingState, PageTitle } from "@buleje/design-system";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users, Search, X, Download, Loader2, AlertCircle,
  Phone, Crown, Star, UserPlus, Moon, Heart,
  ShoppingCart, TrendingUp, UserCheck,
  ChevronLeft, ChevronRight, BarChart3, RefreshCw,
} from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import { m, AnimatePresence } from "@/components/admin/providers";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn, exportToCSV } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import Customer360Tab from "./Customer360Tab";
import ClienteFormModal from "./clientes/ClienteFormModal";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ──────────────────────────────────────────────────────────────────

type Customer = {
  phone: string;
  name: string;
  location?: string;
  loyaltyTier?: string;
  totalSpent?: number;
  loyaltyPoints?: number;
  creditBalance?: number;
  creditLimit?: number;
  tags?: string | null;
  comoLlego?: string | null;
  // Populated client-side from /orders
  _orderCount?: number;
  _lastOrder?: string | null;
  _segment?: Segment;
  _tags?: string[];
};

type QuickFilter = "todos" | "activos" | "inactivos" | "con-deuda";

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

const SEGMENT_CONFIG: Record<Segment, { label: string; color: string; bg: string; border: string; Icon: React.ElementType; variant: BadgeVariant }> = {
  frecuente: { label: "Frecuente", color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30", Icon: Crown,    variant: "success" },
  ocasional: { label: "Ocasional", color: "text-[var(--data-success)] dark:text-[var(--data-success)]",     bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",     border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30",     Icon: Star,     variant: "info" },
  nuevo:     { label: "Nuevo",     color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", border: "border-[var(--rule-base)] dark:border-[var(--rule-base)]", Icon: UserPlus, variant: "pending" },
  perdido:   { label: "Perdido",   color: "text-[var(--data-error)] dark:text-[var(--data-error)]",       bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",       border: "border-[var(--data-error)] dark:border-[var(--data-error)]",       Icon: Moon,     variant: "error" },
};

const PAGE_SIZE = 25;

// ── Component ──────────────────────────────────────────────────────────────

export default function CRMTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);

  const [search, setSearch]           = useState("");
  const [filterSegment, setFilterSegment] = useState<Segment | "todos">("todos");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [page, setPage]               = useState(1);

  const [filterTag, setFilterTag] = useState<string>("todos");

  const [detail, setDetail] = useState<string | null>(null); // phone
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [editingCreditLimit, setEditingCreditLimit] = useState<string | null>(null); // phone
  const [creditLimitInput, setCreditLimitInput] = useState("");

  // Mejora nueva 7: Frecuencia de compra
  type FrequencyFilter = "todos-freq" | "diario" | "semanal" | "quincenal" | "mensual" | "inactivo-freq";
  const [freqFilter, setFreqFilter] = useState<FrequencyFilter>("todos-freq");

  // Mejora 13: Comparativa de clientes
  const [compareMode, setCompareMode] = useState(false);
  const [comparePhones, setComparePhones] = useState<Set<string>>(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);

  // ── Load customers ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/customers?limit=500");
      if (!res.ok) throw new Error("fetch failed");
      const data: Customer[] = await res.json();
      // Annotate with inferred segment and parsed tags
      const annotated = data.map(c => {
        let parsedTags: string[] = [];
        if (c.tags) {
          try {
            const t = JSON.parse(c.tags);
            if (Array.isArray(t)) parsedTags = t;
          } catch { /* ignore */ }
        }
        return { ...c, _segment: inferSegment(c), _tags: parsedTags };
      });
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

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const c of customers) {
      for (const t of (c._tags ?? [])) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [customers]);

  const quickFilterCounts = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    return {
      todos: customers.length,
      activos: customers.filter(c => c._lastOrder && new Date(c._lastOrder).getTime() > thirtyDaysAgo).length,
      inactivos: customers.filter(c => !c._lastOrder || new Date(c._lastOrder).getTime() <= thirtyDaysAgo).length,
      "con-deuda": customers.filter(c => (c.creditBalance ?? 0) > 0).length,
    };
  }, [customers]);

  // Mejora 10: Ranking de clientes por totalSpent
  const rankingMap = useMemo(() => {
    const sorted = [...customers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0));
    const map = new Map<string, number>();
    sorted.forEach((c, idx) => map.set(c.phone, idx + 1));
    return map;
  }, [customers]);

  // Mejora nueva 7: Frecuencia de compra counts
  const freqCounts = useMemo(() => {
    const counts = { "todos-freq": customers.length, diario: 0, semanal: 0, quincenal: 0, mensual: 0, "inactivo-freq": 0 };
    for (const c of customers) {
      const orders30d = c._orderCount ?? 0;
      if (orders30d >= 20) counts.diario++;
      else if (orders30d >= 4) counts.semanal++;
      else if (orders30d >= 2) counts.quincenal++;
      else if (orders30d >= 1) counts.mensual++;
      else counts["inactivo-freq"]++;
    }
    return counts;
  }, [customers]);

  const getFreqLabel = (c: Customer): { label: string } => {
    const orders30d = c._orderCount ?? 0;
    if (orders30d >= 20) return { label: "Diario" };
    if (orders30d >= 4) return { label: "Semanal" };
    if (orders30d >= 2) return { label: "Quincenal" };
    if (orders30d >= 1) return { label: "Mensual" };
    return { label: "Inactivo" };
  };

  const topCustomer = useMemo(() => {
    if (customers.length === 0) return null;
    return [...customers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0))[0];
  }, [customers]);

  const avgSpent = useMemo(() => {
    if (customers.length === 0) return 0;
    return customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0) / customers.length;
  }, [customers]);

  const filtered = useMemo(() => {
    let list = [...customers];

    // Quick filter (activity / debt)
    if (quickFilter !== "todos") {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 86400000;
      if (quickFilter === "activos") {
        list = list.filter(c => c._lastOrder && new Date(c._lastOrder).getTime() > thirtyDaysAgo);
      } else if (quickFilter === "inactivos") {
        list = list.filter(c => !c._lastOrder || new Date(c._lastOrder).getTime() <= thirtyDaysAgo);
      } else if (quickFilter === "con-deuda") {
        list = list.filter(c => (c.creditBalance ?? 0) > 0);
      }
    }

    // Segment filter
    if (filterSegment !== "todos") list = list.filter(c => c._segment === filterSegment);

    // Tag filter
    if (filterTag !== "todos") list = list.filter(c => (c._tags ?? []).includes(filterTag));

    // Mejora nueva 7: Frequency filter
    if (freqFilter !== "todos-freq") {
      list = list.filter(c => {
        const orders30d = c._orderCount ?? 0;
        switch (freqFilter) {
          case "diario": return orders30d >= 20;
          case "semanal": return orders30d >= 4 && orders30d < 20;
          case "quincenal": return orders30d >= 2 && orders30d < 4;
          case "mensual": return orders30d >= 1 && orders30d < 2;
          case "inactivo-freq": return orders30d === 0;
          default: return true;
        }
      });
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [customers, quickFilter, filterSegment, filterTag, freqFilter, search]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp page dentro del rango válido — evita setState derivado en useEffect
  const effectivePage = Math.min(page, totalPages);
  const paginated   = filtered.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);

  // ── Credit limit ──────────────────────────────────────────────────────────

  async function saveCreditLimit(phone: string) {
    const limit = parseFloat(creditLimitInput);
    if (isNaN(limit) || limit < 0) return;
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ creditLimit: limit }),
      });
      if (!res.ok) return;
      setCustomers(prev =>
        prev.map(c => c.phone === phone ? { ...c, creditLimit: limit } : c)
      );
    } finally {
      setEditingCreditLimit(null);
      setCreditLimitInput("");
    }
  }

  // ── Mejora 13: Compare helpers ────────────────────────────────────────────
  const toggleCompare = (phone: string) => {
    setComparePhones(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else if (next.size < 3) next.add(phone);
      return next;
    });
  };

  const compareCustomers = useMemo(() => {
    return customers.filter(c => comparePhones.has(c.phone));
  }, [customers, comparePhones]);

  function getSegmentLabel(c: Customer): string {
    const s = c.totalSpent ?? 0;
    const o = c._orderCount ?? 0;
    if (o === 0) return "Nuevo";
    if (s > 1000) return "Champion";
    if (s > 500) return "Loyal";
    if (o >= 5) return "Frecuente";
    return "Regular";
  }

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState message="Cargando clientes…" />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-[var(--data-error)]" />
        <p className="font-bold text-[var(--text-primary)] dark:text-foreground">Error al cargar clientes</p>
        <button onClick={load} className="text-sm text-primary hover:underline">Reintentar</button>
      </div>
    );
  }

  // ── Empty state — sin clientes ───────────────────────────────────────────

  if (customers.length === 0) {
    return (
      <EmptyState
        illustration="customers"
        title="Sin clientes"
        description="Tus clientes aparecerán aquí cuando hagan su primera compra."
      />
    );
  }

  // ── Customer360 modal ─────────────────────────────────────────────────────

  if (detail) {
    return (
      <AnimatePresence>
        <m.div
          key="360"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
        >
          <Customer360Tab phone={detail} onClose={() => setDetail(null)} />
        </m.div>
      </AnimatePresence>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header estandar ──────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--surface-sunken)] shrink-0">
          <Heart className="w-5 h-5 text-[var(--text-secondary)] dark:text-[var(--text-primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTitle className="text-xl font-bold text-[var(--text-primary)] truncate">Mis Clientes</PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-zinc-400 mt-0.5">CRM, fidelizacion y seguimiento</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button onClick={() => setShowNewClientModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-white transition-colors bg-primary" style={{ backgroundColor: "#00B4A6" }}>
            <UserPlus className="h-4 w-4" /> Nuevo Cliente
          </button>
          <button
            onClick={() => exportToCSV(
              customers.map(c => ({ nombre: c.name, telefono: c.phone, ubicacion: c.location ?? "", gastado: c.totalSpent ?? 0, segmento: c._segment ?? "nuevo" })),
              "crm-clientes"
            )}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <button
            onClick={() => {
              if (filtered.length === 0) return;
              const rows = filtered.map(c => ({
                Nombre: c.name,
                "Teléfono": c.phone,
                "Categoría": c.loyaltyTier ?? "—",
                Tags: (c._tags ?? []).join(", ") || "—",
                "Total gastado (S/)": Number((c.totalSpent ?? 0).toFixed(2)),
                "Última compra": c._lastOrder ? new Date(c._lastOrder).toLocaleDateString("es-PE") : "Sin compras",
                Estado: c._segment === "frecuente" ? "Frecuente" : c._segment === "ocasional" ? "Ocasional" : c._segment === "perdido" ? "Perdido" : "Nuevo",
              }));
              const fecha = new Date().toISOString().slice(0, 10);
              exportToExcel(rows, `clientes-${fecha}`, "Clientes");
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-sm font-bold text-[var(--data-success)] dark:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={() => { setCompareMode(!compareMode); if (compareMode) { setComparePhones(new Set()); } }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors",
              compareMode
                ? "bg-[var(--accent)] text-white hover:bg-[var(--accent)]"
                : "border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent"
            )}
          >
            <BarChart3 className="h-4 w-4" /> {compareMode ? "Cancelar" : "Comparar"}
          </button>
        </div>
      </div>

      {/* ── KPIs estandar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total clientes",   value: String(stats.total),   icon: Users,       color: "text-[var(--data-success)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Activos (30d)",    value: String(stats.activos), icon: UserCheck,   color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Nuevos",           value: String(stats.nuevos),  icon: UserPlus,    color: "text-[var(--text-secondary)]",  bg: "bg-[var(--surface-sunken)]" },
          { label: "CLV promedio",     value: fmt(stats.clvProm),    icon: TrendingUp,  color: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
        ].map(k => (
          <m.div
            key={k.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("rounded-xl p-4", k.bg)}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon className={cn("h-4 w-4", k.color)} />
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            </div>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </m.div>
        ))}
      </div>

      {/* Mejora 13: Canal de adquisicion pie chart */}
      {(() => {
        const CHANNEL_COLORS = ["#00B4A6", "#f97316", "#457b9d", "#9b5de5", "#6b7280"];
        const CHANNEL_LABELS: Record<string, string> = { local: "Local", whatsapp: "WhatsApp", web: "Web", referido: "Referido", redes: "Redes" };
        const channelCounts: Record<string, number> = {};
        for (const c of customers) {
          if (c.comoLlego) {
            const key = c.comoLlego.toLowerCase();
            channelCounts[key] = (channelCounts[key] ?? 0) + 1;
          }
        }
        const entries = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);
        const totalWithChannel = entries.reduce((s, [, v]) => s + v, 0);
        if (totalWithChannel < 5) return null;
        const chartData = entries.map(([name, value]) => ({ name: CHANNEL_LABELS[name] ?? name, value }));
        return (
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 flex items-center gap-4">
            <div style={{ width: 100, height: 100 }}>
              <ResponsiveContainer minWidth={0} width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" cx="50%" cy="50%" outerRadius={45} innerRadius={20} strokeWidth={1}>
                    {chartData.map((_, i) => <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Canal de adquisicion</p>
              {chartData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                  <span className="text-[var(--text-primary)] dark:text-foreground font-medium">{d.name}</span>
                  <span className="text-[var(--text-tertiary)] dark:text-muted">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Toolbar estandar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busqueda */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nombre o telefono..."
            className="w-full pl-10 pr-9 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-[var(--text-primary)] focus:ring-2 focus:ring-[var(--rule-base)] outline-none transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Filtro segmento — chips estandar */}
        {([
          { key: "todos" as const, label: "Todos", count: customers.length },
          { key: "frecuente" as const, label: "Frecuente", count: segmentCounts.frecuente },
          { key: "ocasional" as const, label: "Ocasional", count: segmentCounts.ocasional },
          { key: "nuevo" as const, label: "Nuevo", count: segmentCounts.nuevo },
          { key: "perdido" as const, label: "Perdido", count: segmentCounts.perdido },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilterSegment(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              filterSegment === f.key
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            )}
          >
            {f.label}
            {f.count > 0 && (
              <span className={cn(
                "text-[length:var(--ts-2xs)] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
                filterSegment === f.key ? "bg-[var(--accent)] text-white" : "bg-gray-200 dark:bg-zinc-700 text-[var(--text-secondary)] dark:text-zinc-300"
              )}>
                {f.count > 99 ? "99+" : f.count}
              </span>
            )}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Resultado count */}
        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>

        {/* Acciones */}
        <AdminTooltip content="Recargar clientes desde la base de datos">
          <button onClick={load} aria-label="Actualizar" className="p-2 rounded-lg bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        </AdminTooltip>
      </div>

      {/* Filtros secundarios: quick filter + frecuencia + tags */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Quick filters */}
        {([
          { key: "todos" as QuickFilter,     label: "Todos" },
          { key: "activos" as QuickFilter,   label: "Activos" },
          { key: "inactivos" as QuickFilter, label: "Inactivos 30d" },
          { key: "con-deuda" as QuickFilter, label: "Con deuda" },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              quickFilter === f.key
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            )}
          >
            {f.label}
            <span className={cn(
              "text-[length:var(--ts-2xs)] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
              quickFilter === f.key ? "bg-[var(--accent)] text-white" : "bg-gray-200 dark:bg-zinc-700 text-[var(--text-secondary)] dark:text-zinc-300"
            )}>
              {quickFilterCounts[f.key] > 99 ? "99+" : quickFilterCounts[f.key]}
            </span>
          </button>
        ))}

        <span className="text-[var(--text-tertiary)] dark:text-zinc-600">|</span>

        {/* Frecuencia de compra */}
        {([
          { key: "todos-freq" as const, label: "Todos" },
          { key: "diario" as const, label: "Diario" },
          { key: "semanal" as const, label: "Semanal" },
          { key: "quincenal" as const, label: "Quincenal" },
          { key: "mensual" as const, label: "Mensual" },
          { key: "inactivo-freq" as const, label: "Inactivo" },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setFreqFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              freqFilter === f.key
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            )}
          >
            {f.label}
            <span className={cn(
              "text-[length:var(--ts-2xs)] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
              freqFilter === f.key ? "bg-[var(--accent)] text-white" : "bg-gray-200 dark:bg-zinc-700 text-[var(--text-secondary)] dark:text-zinc-300"
            )}>
              {freqCounts[f.key] > 99 ? "99+" : freqCounts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">Etiqueta:</span>
          <button
            onClick={() => setFilterTag("todos")}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              filterTag === "todos"
                ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            )}
          >
            Todas
          </button>
          {allTags.map(tag => {
            const isActive = filterTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setFilterTag(tag)}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
                  isActive
                    ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                    : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Mejora 10: Top customer summary — barra compacta */}
      {topCustomer && customers.length >= 3 && (
        <div className="flex items-center justify-between bg-[var(--surface-sunken)]/50 rounded-xl px-4 py-2.5 mb-1 text-xs flex-wrap gap-2">
          <span className="flex items-center gap-1.5">&#127942; Top: <strong>{topCustomer.name}</strong> &middot; {fmt(topCustomer.totalSpent ?? 0)}</span>
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-[var(--data-success)]" /> {customers.length} clientes</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-[var(--data-success)]" /> Prom: {fmt(avgSpent)}</span>
          <span className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-[var(--text-secondary)]" /> Activos 30d: {stats.activos}</span>
        </div>
      )}

      {/* Table — UX Mejora 18: Sticky header */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="max-h-[65vh] overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border z-10 shadow-[var(--shadow-sm)]">
              <tr>
                {compareMode && <th className="w-10 px-2 py-3"><span className="sr-only">Seleccionar</span></th>}
                <th className="text-center px-3 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] w-14">Rank</th>
                <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Cliente</th>
                <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Telefono</th>
                <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hidden sm:table-cell">Ultimo pedido</th>
                <th className="text-right px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hidden md:table-cell">Total gastado</th>
                <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hidden lg:table-cell">Credito</th>
                <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Segmento</th>
                <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hidden md:table-cell">Contacto</th>
                <th className="text-center px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-card-border">
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)] dark:text-muted">
                      <Users className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No se encontraron clientes</p>
                      {(search || filterSegment !== "todos" || quickFilter !== "todos" || filterTag !== "todos") && (
                        <button onClick={() => { setSearch(""); setFilterSegment("todos"); setQuickFilter("todos"); setFilterTag("todos"); }} className="text-xs text-primary hover:underline">
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
                  <m.tr
                    key={c.phone}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn("hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors", compareMode && comparePhones.has(c.phone) && "bg-[var(--surface-sunken)]")}
                  >
                    {/* Mejora 13: Checkbox para comparar */}
                    {compareMode && (
                      <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={comparePhones.has(c.phone)}
                          onChange={() => toggleCompare(c.phone)}
                          disabled={!comparePhones.has(c.phone) && comparePhones.size >= 3}
                          className="h-4 w-4 rounded border-[var(--rule-base)] text-[var(--text-secondary)] focus:ring-[var(--rule-base)]"
                        />
                      </td>
                    )}
                    {/* Ranking */}
                    <td className="px-3 py-3 text-center">
                      {(() => {
                        const rank = rankingMap.get(c.phone) ?? 999;
                        if (rank === 1) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning)] text-xs font-extrabold">1</span>;
                        if (rank === 2) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-[var(--text-primary)] text-xs font-extrabold">2</span>;
                        if (rank === 3) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning)] text-xs font-extrabold">3</span>;
                        if (rank <= 10) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted text-[length:var(--ts-2xs)] font-bold">#{rank}</span>;
                        return <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">—</span>;
                      })()}
                    </td>

                    {/* Nombre */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-[length:var(--ts-2xs)] font-extrabold text-primary shrink-0 select-none">
                          {c.name.split(" ").slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("")}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{c.name}</p>
                          {c.location && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate max-w-[120px]">{c.location}</p>}
                          {/* Mejora 12: Resumen compacto del cliente */}
                          <p className="hidden sm:block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted truncate max-w-[220px]">
                            {c._orderCount ?? 0} compras · S/{((c.totalSpent ?? 0)).toFixed(0)} · {getFreqLabel(c).label} · {c._lastOrder ? fmtRelative(c._lastOrder) : "sin compras"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Teléfono */}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)] dark:text-muted">
                        <Phone className="h-3 w-3" />{c.phone}
                      </span>
                    </td>

                    {/* Último pedido */}
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">
                      {c._lastOrder ? fmtRelative(c._lastOrder) : "—"}
                    </td>

                    {/* Total gastado */}
                    <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground hidden md:table-cell">
                      {fmt(c.totalSpent ?? 0)}
                    </td>

                    {/* Crédito */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {editingCreditLimit === c.phone ? (
                        <form
                          onSubmit={e => { e.preventDefault(); saveCreditLimit(c.phone); }}
                          className="flex items-center gap-1"
                        >
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            step={0.01}
                            value={creditLimitInput}
                            onChange={e => setCreditLimitInput(e.target.value)}
                            className="w-20 text-xs border border-primary/40 rounded-lg px-2 py-1 bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="0.00"
                          />
                          <button type="submit" className="text-[length:var(--ts-2xs)] px-1.5 py-1 bg-primary text-white rounded-lg font-bold">OK</button>
                          <button type="button" onClick={() => setEditingCreditLimit(null)} className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">×</button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingCreditLimit(c.phone); setCreditLimitInput(String(c.creditLimit ?? 0)); }}
                          className="group text-left"
                          title="Click para editar límite de crédito"
                        >
                          {c.creditLimit != null && c.creditLimit > 0 ? (
                            <StatusBadge
                              variant={(c.creditBalance ?? 0) >= c.creditLimit ? "error" : "success"}
                              label={(c.creditBalance ?? 0) >= c.creditLimit ? "LÍMITE ALCANZADO" : `${fmt(c.creditBalance ?? 0)} / ${fmt(c.creditLimit)}`}
                              size="sm"
                            />
                          ) : (
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] group-hover:text-primary transition-colors">+ Añadir límite</span>
                          )}
                        </button>
                      )}
                    </td>

                    {/* Segmento */}
                    <td className="px-4 py-3">
                      <StatusBadge variant={cfg.variant} label={cfg.label} icon={Icon} size="sm" />
                    </td>

                    {/* Mejora 9R2: Ultimo contacto */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {(() => {
                        const lastContact = c._lastOrder;
                        if (!lastContact) return <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">&mdash;</span>;
                        const days = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
                        let label: string;
                        let colorClass: string;
                        if (days === 0) { label = "Hoy"; colorClass = "text-[var(--data-success)] dark:text-[var(--data-success)]"; }
                        else if (days === 1) { label = "Ayer"; colorClass = "text-[var(--data-success)] dark:text-[var(--data-success)]"; }
                        else if (days < 7) { label = `Hace ${days}d`; colorClass = "text-[var(--data-success)] dark:text-[var(--data-success)]"; }
                        else if (days < 14) { label = "Hace 1 sem"; colorClass = "text-yellow-600 dark:text-yellow-400"; }
                        else if (days < 30) { label = `Hace ${Math.floor(days / 7)} sem`; colorClass = "text-yellow-600 dark:text-yellow-400"; }
                        else if (days < 90) { label = `Hace ${Math.floor(days / 30)} meses`; colorClass = "text-red-600 dark:text-red-400"; }
                        else { label = "Inactivo"; colorClass = "text-[var(--text-tertiary)] dark:text-muted"; }
                        return <span className={cn("text-[length:var(--ts-2xs)] font-bold", colorClass)}>{label}</span>;
                      })()}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDetail(c.phone)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[length:var(--ts-2xs)] font-bold transition-colors"
                      >
                        <ShoppingCart className="h-3 w-3" />360°
                      </button>
                    </td>
                  </m.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)] dark:border-card-border bg-gray-50 dark:bg-surface">
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">
              Página {effectivePage} de {totalPages} · {filtered.length} clientes
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={effectivePage === 1}
                className="p-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border hover:bg-white dark:hover:bg-card disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(effectivePage - 2 + i, totalPages - 4 + i));
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn("w-8 h-8 text-xs rounded-lg font-semibold transition-colors",
                      effectivePage === p
                        ? "bg-primary text-white"
                        : "border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-white dark:hover:bg-card"
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={effectivePage === totalPages}
                className="p-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border hover:bg-white dark:hover:bg-card disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mejora 13: Compare sticky bar */}
      {compareMode && comparePhones.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-card border-t border-[var(--rule-base)] dark:border-card-border px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">
              {comparePhones.size} cliente{comparePhones.size !== 1 ? "s" : ""} seleccionado{comparePhones.size !== 1 ? "s" : ""} (max 3)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setComparePhones(new Set()); }}
                className="px-3 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Limpiar
              </button>
              <button
                onClick={() => setShowCompareModal(true)}
                disabled={comparePhones.size < 2}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
              >
                Ver comparativa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mejora 13: Compare modal */}
      <AnimatePresence>
        {showCompareModal && compareCustomers.length >= 2 && (
          <>
            <m.div
              key="compare-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop"
              onClick={() => setShowCompareModal(false)}
            />
            <m.div
              key="compare-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowCompareModal(false)}
            >
              <div className="w-full max-w-2xl bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[var(--text-secondary)]" /> Comparativa de Clientes
                  </CardTitle>
                  <button onClick={() => setShowCompareModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface">
                    <X className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--rule-base)] dark:border-card-border">
                        <th className="text-left py-3 px-3 text-xs font-bold text-[var(--text-secondary)] uppercase">Metrica</th>
                        {compareCustomers.map(c => (
                          <th key={c.phone} className="text-center py-3 px-3 text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                      {/* Total gastado */}
                      {(() => {
                        const values = compareCustomers.map(c => c.totalSpent ?? 0);
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] font-semibold">Total gastado</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("py-2.5 px-3 text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success)]" : "text-[var(--text-primary)] dark:text-foreground")}>
                                S/{(values[i]).toFixed(0)}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Frecuencia (pedidos) */}
                      {(() => {
                        const values = compareCustomers.map(c => c._orderCount ?? 0);
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] font-semibold">Pedidos</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("py-2.5 px-3 text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success)]" : "text-[var(--text-primary)] dark:text-foreground")}>
                                {values[i]}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Ticket promedio */}
                      {(() => {
                        const values = compareCustomers.map(c => {
                          const orders = c._orderCount ?? 0;
                          return orders > 0 ? (c.totalSpent ?? 0) / orders : 0;
                        });
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] font-semibold">Ticket promedio</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("py-2.5 px-3 text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success)]" : "text-[var(--text-primary)] dark:text-foreground")}>
                                S/{values[i].toFixed(0)}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Ultima compra */}
                      {(() => {
                        const values = compareCustomers.map(c => c._lastOrder ? new Date(c._lastOrder).getTime() : 0);
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] font-semibold">Ultima compra</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("py-2.5 px-3 text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success)]" : "text-[var(--text-primary)] dark:text-foreground")}>
                                {c._lastOrder ? fmtRelative(c._lastOrder) : "--"}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Fiado pendiente */}
                      {(() => {
                        const values = compareCustomers.map(c => c.creditBalance ?? 0);
                        const best = Math.min(...values);
                        return (
                          <tr>
                            <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] font-semibold">Fiado pendiente</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("py-2.5 px-3 text-center text-sm font-bold", values[i] === best ? "text-[var(--data-success)]" : "text-[var(--text-primary)] dark:text-foreground")}>
                                S/{values[i].toFixed(0)}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Segmento */}
                      <tr>
                        <td className="py-2.5 px-3 text-xs text-[var(--text-secondary)] font-semibold">Segmento</td>
                        {compareCustomers.map(c => (
                          <td key={c.phone} className="py-2.5 px-3 text-center">
                            <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{getSegmentLabel(c)}</span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* New client modal */}
      <ClienteFormModal
        isOpen={showNewClientModal}
        onClose={() => setShowNewClientModal(false)}
        onSaved={() => { setShowNewClientModal(false); load(); }}
      />
    </div>
  );
}
