"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShoppingCart, ChevronDown, ChevronUp, Check, Loader2,
  AlertTriangle, Clock, Package, RefreshCw, Sparkles,
  Search, X,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { toast } from "sonner";

type Urgency = "CRITICO" | "URGENTE" | "PLANIFICAR";

type Sugerencia = {
  productId: number;
  productName: string;
  category: string;
  currentStock: number;
  stockMin: number;
  dailyAvg: number;
  daysOfStock: number;
  suggestedQty: number;
  suggestedSupplier: { id: string; name: string } | null;
  lastPrice: number | null;
  urgency: Urgency;
};

const URGENCY_CONFIG: Record<Urgency, {
  label: string;
  short: string;
  hint: string;
  border: string;
  bg: string;
  text: string;
  iconBg: string;
  ring: string;
  icon: LucideIcon;
}> = {
  CRITICO: {
    label: "Crítico — se acaba en 3 días o menos",
    short: "Crítico",
    hint: "≤ 3 días",
    border: "border-[var(--data-error-500)]/40",
    bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10",
    text: "text-[var(--data-error-500)]",
    iconBg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/20",
    ring: "ring-[var(--data-error-500)]/40",
    icon: AlertTriangle,
  },
  URGENTE: {
    label: "Urgente — se acaba esta semana",
    short: "Urgente",
    hint: "4-7 días",
    border: "border-[var(--data-warning-500)]/40",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10",
    text: "text-[var(--data-warning-500)]",
    iconBg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/20",
    ring: "ring-[var(--data-warning-500)]/40",
    icon: Clock,
  },
  PLANIFICAR: {
    label: "Planificar — más de 7 días",
    short: "Planificar",
    hint: "> 7 días",
    border: "border-[var(--data-success-500)]/40",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--data-success-500)]/10",
    text: "text-[var(--data-success-500)]",
    iconBg: "bg-emerald-100 dark:bg-[var(--data-success-500)]/20",
    ring: "ring-[var(--data-success-500)]/40",
    icon: Package,
  },
};

const URGENCY_ORDER: Urgency[] = ["CRITICO", "URGENTE", "PLANIFICAR"];

type FilterKey = "todos" | "CRITICO" | "URGENTE" | "PLANIFICAR" | "sin-proveedor";

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[var(--color-card)] border-2 border-[var(--rule-base)] rounded-2xl p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-6 w-6 rounded bg-gray-200 dark:bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 bg-gray-200 dark:bg-white/10 rounded" />
          <div className="h-3 w-1/3 bg-gray-200 dark:bg-white/10 rounded" />
          <div className="h-3 w-1/2 bg-gray-200 dark:bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}

interface KPIProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent?: "danger" | "warning" | "success" | "neutral";
}

function KPICard({ label, value, sub, icon: Icon, accent = "neutral" }: KPIProps) {
  const cfg = {
    danger:  { text: "text-[var(--data-error-500)]",   iconBg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15",     border: "border-[var(--data-error-500)]/30" },
    warning: { text: "text-[var(--data-warning-500)]", iconBg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15", border: "border-[var(--data-warning-500)]/30" },
    success: { text: "text-[var(--data-success-500)]", iconBg: "bg-emerald-100 dark:bg-[var(--data-success-500)]/15",               border: "border-[var(--data-success-500)]/30" },
    neutral: { text: "text-[var(--text-primary)]",     iconBg: "bg-[var(--surface-sunken)]",                                        border: "border-[var(--rule-base)]" },
  }[accent];
  return (
    <div className={cn(
      "bg-white dark:bg-[var(--color-card)] border-2 rounded-2xl p-4 flex items-center gap-3 min-w-0 transition-shadow hover:shadow-sm",
      cfg.border,
    )}>
      <span className={cn("inline-flex items-center justify-center h-11 w-11 rounded-xl shrink-0", cfg.iconBg)}>
        <Icon className={cn("h-5 w-5", cfg.text)} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</p>
        <p className={cn("text-2xl font-extrabold tabular-nums leading-none mt-1 truncate", cfg.text)}>{value}</p>
        {sub && <p className="text-xs text-[var(--text-secondary)] mt-1 truncate font-medium">{sub}</p>}
      </div>
    </div>
  );
}

export default function SugerenciasCompraTab() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<Urgency, boolean>>({
    CRITICO: false, URGENTE: false, PLANIFICAR: true,
  });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/compras/sugerencias");
      if (res.ok) {
        const data = await res.json();
        setSugerencias(data.sugerencias ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const counts: Record<Urgency, number> = { CRITICO: 0, URGENTE: 0, PLANIFICAR: 0 };
    let totalSuggested = 0;
    let totalCost = 0;
    let withoutSupplier = 0;
    for (const s of sugerencias) {
      counts[s.urgency] += 1;
      totalSuggested += s.suggestedQty;
      if (s.lastPrice != null) totalCost += s.lastPrice * s.suggestedQty;
      if (!s.suggestedSupplier) withoutSupplier += 1;
    }
    return { counts, totalSuggested, totalCost, withoutSupplier, total: sugerencias.length };
  }, [sugerencias]);

  // ── Visible (filter + search) ─────────────────────────────────────────────
  const visible = useMemo(() => {
    return sugerencias.filter((s) => {
      if (filter === "sin-proveedor") {
        if (s.suggestedSupplier) return false;
      } else if (filter !== "todos" && s.urgency !== filter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!s.productName.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sugerencias, filter, search]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (productId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  const selectAllVisible = () => {
    const ids = visible.map((s) => s.productId);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectAllUrgency = (urgency: Urgency) => {
    const ids = sugerencias.filter((s) => s.urgency === urgency).map((s) => s.productId);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleCollapse = (urgency: Urgency) => {
    setCollapsed((prev) => ({ ...prev, [urgency]: !prev[urgency] }));
  };

  // ── Selected stats ────────────────────────────────────────────────────────
  const selectedStats = useMemo(() => {
    let qty = 0;
    let cost = 0;
    const supplierGroups = new Map<string, number>();
    for (const s of sugerencias) {
      if (!selected.has(s.productId)) continue;
      qty += s.suggestedQty;
      if (s.lastPrice != null) cost += s.lastPrice * s.suggestedQty;
      const key = s.suggestedSupplier?.id ?? "sin-proveedor";
      supplierGroups.set(key, (supplierGroups.get(key) ?? 0) + 1);
    }
    return { qty, cost, supplierGroups: supplierGroups.size };
  }, [selected, sugerencias]);

  // ── Crear OCs por proveedor ──────────────────────────────────────────────
  const createOCs = async () => {
    if (selected.size === 0) return;
    setCreating(true);
    try {
      const selectedItems = sugerencias.filter((s) => selected.has(s.productId));

      const groups = new Map<string, Sugerencia[]>();
      for (const item of selectedItems) {
        const key = item.suggestedSupplier?.id ?? "sin-proveedor";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      let createdCount = 0;
      for (const [supplierId, items] of groups) {
        const supplierName =
          supplierId !== "sin-proveedor"
            ? items[0].suggestedSupplier?.name ?? "Proveedor por definir"
            : "Proveedor por definir";

        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            supplierId: supplierId !== "sin-proveedor" ? supplierId : "",
            supplierName,
            items: items.map((i) => ({
              productId: i.productId,
              name: i.productName,
              quantity: i.suggestedQty,
              unitCost: i.lastPrice ?? 0,
              unit: "und",
            })),
            notes: `OC generada automaticamente por sugerencias de compra`,
          }),
        });

        if (res.ok) {
          createdCount++;
          const po = await res.json();
          // Auto-create payable (fire-and-forget)
          fetch("/api/payables", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              supplierId: supplierId !== "sin-proveedor" ? supplierId : "",
              supplierName,
              purchaseOrderId: po.id,
              description: `Orden de compra ${po.id}`,
              amount: po.total,
              dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            }),
          }).catch((err) => console.warn("[SugerenciasCompraTab] payable create failed:", err));
        }
      }

      if (createdCount === groups.size) {
        toast.success(
          `${createdCount} ${createdCount === 1 ? "orden creada" : "órdenes creadas"}`,
          { description: `${selected.size} productos repartidos en ${groups.size} ${groups.size === 1 ? "proveedor" : "proveedores"}.` }
        );
      } else if (createdCount > 0) {
        toast(`Creadas ${createdCount}/${groups.size} órdenes`, { description: "Algunas fallaron. Reintentá." });
      } else {
        toast.error("No se pudo crear ninguna orden");
      }
      setSelected(new Set());
      void load(true);
    } catch {
      toast.error("Error al crear órdenes de compra");
    }
    setCreating(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-gray-100 dark:bg-white/5 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (sugerencias.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--data-success-500)]/5 px-6 py-14 text-center">
        <span className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-100 dark:bg-[var(--data-success-500)]/20 mb-4">
          <Check className="h-8 w-8 text-[var(--data-success-500)]" strokeWidth={2.5} />
        </span>
        <h2 className="text-xl font-extrabold text-[var(--text-primary)]">Tu inventario está al día</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
          No hay productos por debajo del stock mínimo ahora mismo. El sistema revisa cada noche y te avisará cuando algo necesite reposición.
        </p>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Volver a calcular
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-32">
      {/* ─── Hero header ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-white to-[var(--accent-soft)]/40 dark:from-[var(--color-card)] dark:to-[var(--accent-muted)]/20 px-5 py-4 flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-[var(--accent-soft)] dark:bg-[var(--data-success-500)]/15 border border-[var(--data-success-500)]/30 shrink-0">
          <Sparkles className="h-6 w-6 text-[var(--data-success-500)]" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
            Sugerencias de compra
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {stats.total} {stats.total === 1 ? "producto necesita" : "productos necesitan"} reposición. Marcá los que querés pedir y generamos las órdenes por proveedor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Recalcular
        </button>
      </section>

      {/* ─── KPI summary ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Críticos"     value={stats.counts.CRITICO}    icon={AlertTriangle} accent="danger"  sub="Se acaban en ≤3 días" />
        <KPICard label="Urgentes"     value={stats.counts.URGENTE}    icon={Clock}         accent="warning" sub="Esta semana" />
        <KPICard label="A planificar" value={stats.counts.PLANIFICAR} icon={Package}       accent="success" sub="Más de 7 días" />
        <KPICard
          label="Costo estimado"
          value={stats.totalCost > 0 ? `S/${Math.round(stats.totalCost).toLocaleString("es-PE")}` : "—"}
          icon={ShoppingCart}
          sub={`${stats.totalSuggested.toLocaleString("es-PE")} unidades`}
        />
      </div>

      {/* ─── Search + filtros ────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Search bar destacada */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar producto o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-12 pr-12 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-primary transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter pills + acción "seleccionar visibles" */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { id: "todos",         label: "Todos",         count: stats.total,             tone: "neutral" as const },
            { id: "CRITICO",       label: "Críticos",      count: stats.counts.CRITICO,    tone: "danger"  as const },
            { id: "URGENTE",       label: "Urgentes",      count: stats.counts.URGENTE,    tone: "warning" as const },
            { id: "PLANIFICAR",    label: "Planificar",    count: stats.counts.PLANIFICAR, tone: "success" as const },
            { id: "sin-proveedor", label: "Sin proveedor", count: stats.withoutSupplier,   tone: "warning" as const },
          ]).map((p) => {
            const active = filter === p.id;
            const toneCls = {
              neutral: { active: "bg-[var(--text-primary)] text-white border-[var(--text-primary)]",                    badge: "bg-white/25 text-white" },
              danger:  { active: "bg-[var(--data-error-500)] text-white border-[var(--data-error-500)]",                badge: "bg-white/25 text-white" },
              warning: { active: "bg-[var(--data-warning-500)] text-white border-[var(--data-warning-500)]",            badge: "bg-white/25 text-white" },
              success: { active: "bg-[var(--data-success-500)] text-white border-[var(--data-success-500)]",            badge: "bg-white/25 text-white" },
            }[p.tone];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilter(p.id as FilterKey)}
                className={cn(
                  "inline-flex items-center gap-2 h-11 px-4 rounded-2xl text-sm font-bold transition-colors border-2",
                  active
                    ? toneCls.active
                    : "bg-white dark:bg-[var(--color-card)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
                )}
              >
                {p.label}
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums min-w-[24px] text-center",
                  active ? toneCls.badge : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                )}>
                  {p.count}
                </span>
              </button>
            );
          })}
          {visible.length > 0 && (
            <button
              type="button"
              onClick={selectAllVisible}
              className="ml-auto inline-flex items-center gap-1.5 h-11 px-3 rounded-2xl text-sm font-bold text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
            >
              {visible.every((s) => selected.has(s.productId)) ? "Deseleccionar visibles" : "Seleccionar visibles"}
            </button>
          )}
        </div>
      </div>

      {/* Sin proveedor warning */}
      {stats.withoutSupplier > 0 && filter !== "sin-proveedor" && (
        <button
          type="button"
          onClick={() => setFilter("sin-proveedor")}
          className="w-full text-left flex items-start gap-3 rounded-2xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 px-4 py-3 text-sm text-[var(--data-warning-500)] hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning-500)]/15 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span className="flex-1">
            <strong>{stats.withoutSupplier}</strong> {stats.withoutSupplier === 1 ? "producto" : "productos"} sin proveedor anterior. La OC quedará pendiente de asignación. <span className="underline font-bold">Ver lista →</span>
          </span>
        </button>
      )}

      {/* ─── Secciones por urgencia ──────────────────────────────────── */}
      {URGENCY_ORDER.map((urgency) => {
        const items = visible.filter((s) => s.urgency === urgency);
        if (items.length === 0) return null;
        const config = URGENCY_CONFIG[urgency];
        const isCollapsed = collapsed[urgency];
        const Icon = config.icon;
        const allSelectedInUrgency = items.every((i) => selected.has(i.productId));

        return (
          <section key={urgency} className={cn("rounded-2xl border-2 bg-white dark:bg-[var(--color-card)] overflow-hidden", config.border)}>
            {/* Section header */}
            <header className={cn("flex items-center gap-3 px-5 py-3.5 flex-wrap", config.bg)}>
              <button
                type="button"
                onClick={() => toggleCollapse(urgency)}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-3 flex-1 text-left"
              >
                <span className={cn("inline-flex items-center justify-center h-10 w-10 rounded-xl shrink-0", config.iconBg)}>
                  <Icon className={cn("h-5 w-5", config.text)} strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className={cn("text-base font-extrabold", config.text)}>{config.short}</p>
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    {config.label.split("—")[1]?.trim() ?? config.hint}
                  </p>
                </div>
                <span className={cn(
                  "ml-auto inline-flex items-center justify-center h-8 min-w-[36px] px-2.5 rounded-xl text-sm font-extrabold tabular-nums",
                  config.iconBg, config.text,
                )}>
                  {items.length}
                </span>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => selectAllUrgency(urgency)}
                  className={cn(
                    "h-9 px-3 rounded-xl text-xs font-bold transition-colors",
                    allSelectedInUrgency
                      ? cn(config.text, "hover:underline")
                      : "text-[var(--text-secondary)] hover:bg-white/60 dark:hover:bg-white/10",
                  )}
                >
                  {allSelectedInUrgency ? "Quitar todos" : "Marcar todos"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollapse(urgency)}
                  aria-label={isCollapsed ? "Expandir" : "Colapsar"}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                >
                  {isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                </button>
              </div>
            </header>

            {/* Items */}
            {!isCollapsed && (
              <div className="p-3 sm:p-4 grid gap-3 sm:grid-cols-2">
                {items.map((s) => {
                  const isSelected = selected.has(s.productId);
                  const lineTotal = s.lastPrice != null ? s.lastPrice * s.suggestedQty : null;
                  return (
                    <button
                      key={s.productId}
                      type="button"
                      onClick={() => toggleSelect(s.productId)}
                      aria-pressed={isSelected}
                      className={cn(
                        "text-left rounded-2xl border-2 p-4 transition-all flex items-start gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        isSelected
                          ? cn("border-primary ring-2 ring-primary/30 bg-primary/5 dark:bg-primary/10")
                          : "border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:border-[var(--text-tertiary)] hover:shadow-sm",
                      )}
                    >
                      {/* Checkbox */}
                      <div className={cn(
                        "mt-0.5 h-6 w-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected ? "bg-primary border-primary" : "border-[var(--rule-base)]",
                      )}>
                        {isSelected && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Producto + categoría */}
                        <div className="flex items-start gap-2">
                          <p className="text-base font-extrabold text-[var(--text-primary)] line-clamp-2 leading-tight flex-1">
                            {s.productName}
                          </p>
                          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] shrink-0 whitespace-nowrap">
                            {s.category}
                          </span>
                        </div>

                        {/* Stock chips */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-bold border",
                            config.iconBg, config.text, config.border,
                          )}>
                            {s.daysOfStock >= 9999 ? "Stock alto" : `${s.daysOfStock} ${s.daysOfStock === 1 ? "día" : "días"}`}
                          </span>
                          <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                            Stock {s.currentStock} · vende {s.dailyAvg}/día
                          </span>
                        </div>

                        {/* CTA: cantidad a pedir + costo */}
                        <div className="flex items-baseline gap-2 flex-wrap pt-1">
                          <span className="text-lg font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
                            Pedir {s.suggestedQty}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-secondary)]">
                            {s.suggestedQty === 1 ? "unidad" : "unidades"}
                          </span>
                          {lineTotal != null && (
                            <span className="ml-auto text-sm font-bold text-[var(--text-primary)] tabular-nums">
                              ≈ S/{lineTotal.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {/* Proveedor */}
                        <div className="flex items-center gap-2 text-xs flex-wrap pt-1 border-t border-[var(--rule-soft)]">
                          {s.suggestedSupplier ? (
                            <span className="inline-flex items-center gap-1 text-[var(--text-secondary)] font-medium truncate">
                              <span className="text-[var(--text-tertiary)]">Proveedor</span>
                              <strong className="text-[var(--text-primary)] truncate">{s.suggestedSupplier.name}</strong>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--data-warning-500)] font-bold">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Sin proveedor anterior
                            </span>
                          )}
                          {s.lastPrice != null && (
                            <span className="ml-auto text-[var(--text-tertiary)] tabular-nums">
                              Último S/{Number(s.lastPrice).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* Empty filter result */}
      {visible.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 px-6 py-12 text-center">
          <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-[var(--surface-canvas)] mb-3">
            <Search className="h-6 w-6 text-[var(--text-tertiary)]" />
          </span>
          <p className="text-base font-bold text-[var(--text-primary)]">No hay sugerencias en este filtro</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Ajustá el filtro o limpiá la búsqueda para ver más.</p>
          <button
            type="button"
            onClick={() => { setFilter("todos"); setSearch(""); }}
            className="mt-4 inline-flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
          >
            Ver todas
          </button>
        </div>
      )}

      {/* Sticky bottom bar — solo aparece con seleccionados */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1.5rem)] w-full sm:w-auto px-2">
          <div className="bg-white dark:bg-[var(--color-card)] border-2 border-[var(--rule-base)] rounded-2xl shadow-2xl flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3">
            <span className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 shrink-0">
              <Sparkles className="h-5 w-5 text-primary" strokeWidth={2.2} />
            </span>
            <div className="text-sm min-w-0 flex-1">
              <p className="font-extrabold text-[var(--text-primary)] truncate">
                {selected.size} {selected.size === 1 ? "producto" : "productos"} · {selectedStats.qty} {selectedStats.qty === 1 ? "unidad" : "unidades"}
              </p>
              <p className="text-xs text-[var(--text-secondary)] font-medium truncate">
                {selectedStats.cost > 0 ? `≈ S/${Math.round(selectedStats.cost).toLocaleString("es-PE")} · ` : ""}
                {selectedStats.supplierGroups} {selectedStats.supplierGroups === 1 ? "orden" : "órdenes"} por proveedor
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="h-11 px-3 rounded-xl text-sm font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => void createOCs()}
              disabled={creating}
              className="inline-flex items-center gap-2 h-11 px-4 sm:px-5 rounded-2xl bg-primary text-white text-sm font-extrabold hover:bg-primary-dark disabled:opacity-60 transition-colors shadow-sm shrink-0"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              {creating ? "Creando..." : "Crear órdenes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
