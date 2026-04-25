"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShoppingCart, ChevronDown, ChevronUp, Check, Loader2,
  TrendingDown, AlertTriangle, Clock, Package, RefreshCw, Sparkles,
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
  border: string;
  bg: string;
  text: string;
  icon: LucideIcon;
}> = {
  CRITICO:    { label: "Crítico — se acaba en 3 días o menos", short: "Crítico",    border: "border-l-[var(--data-error)]",   bg: "bg-[var(--data-error-50)]",   text: "text-[var(--data-error)]",   icon: AlertTriangle },
  URGENTE:    { label: "Urgente — se acaba esta semana",       short: "Urgente",    border: "border-l-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)]", text: "text-[var(--data-warning)]", icon: Clock         },
  PLANIFICAR: { label: "Planificar — más de 7 días",           short: "Planificar", border: "border-l-[var(--data-success)]", bg: "bg-[var(--accent-soft)]",     text: "text-[var(--data-success)]", icon: Package       },
};

const URGENCY_ORDER: Urgency[] = ["CRITICO", "URGENTE", "PLANIFICAR"];

type FilterKey = "todos" | "CRITICO" | "URGENTE" | "PLANIFICAR" | "sin-proveedor";

function SkeletonCard() {
  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-5 w-5 rounded bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 bg-gray-200 rounded" />
          <div className="h-3 w-1/3 bg-gray-200 rounded" />
          <div className="h-3 w-1/2 bg-gray-200 rounded" />
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
  const accentText = {
    danger:  "text-[var(--data-error)]",
    warning: "text-[var(--data-warning)]",
    success: "text-[var(--data-success)]",
    neutral: "text-[var(--text-primary)]",
  }[accent];
  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</p>
        <p className={cn("text-2xl font-extrabold tabular-nums leading-none mt-1.5 truncate", accentText)}>{value}</p>
        {sub && <p className="text-xs text-[var(--text-tertiary)] mt-1 truncate">{sub}</p>}
      </div>
      <Icon className={cn("h-5 w-5 shrink-0", accentText)} />
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
          }).catch(() => {});
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
      <div className="space-y-3">
        <div className="h-6 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (sugerencias.length === 0) {
    return (
      <div className="text-center py-12">
        <Check className="h-12 w-12 text-[var(--data-success)] mx-auto mb-3" />
        <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">
          Tu inventario está al día
        </SectionTitle>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          No hay productos que necesiten reabastecimiento ahora mismo.
        </p>
        <button
          onClick={() => void load(true)}
          className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          Volver a calcular
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-32">
      {/* Header — sin subtítulo, el tab indica la función */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)]">
            Sugerencias de compra
          </SectionTitle>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          Recalcular
        </button>
      </div>

      {/* KPI summary */}
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

      {/* Filtros + búsqueda */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: "todos",         label: "Todos",         count: stats.total           },
          { id: "CRITICO",       label: "Críticos",      count: stats.counts.CRITICO  },
          { id: "URGENTE",       label: "Urgentes",      count: stats.counts.URGENTE  },
          { id: "PLANIFICAR",    label: "Planificar",    count: stats.counts.PLANIFICAR },
          { id: "sin-proveedor", label: "Sin proveedor", count: stats.withoutSupplier },
        ] as const).map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
              filter === p.id
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "bg-white text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
            )}
          >
            {p.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums min-w-[20px] text-center",
              filter === p.id ? "bg-white/25" : "bg-[var(--surface-sunken)]"
            )}>
              {p.count}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            placeholder="Buscar producto o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-[var(--rule-base)] rounded-lg text-xs bg-white text-[var(--text-primary)] outline-none focus:border-primary w-56"
          />
          {visible.length > 0 && (
            <button
              onClick={selectAllVisible}
              className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
            >
              {visible.every((s) => selected.has(s.productId)) ? "Deseleccionar visibles" : "Seleccionar visibles"}
            </button>
          )}
        </div>
      </div>

      {/* Sin proveedor warning */}
      {stats.withoutSupplier > 0 && filter !== "sin-proveedor" && (
        <button
          onClick={() => setFilter("sin-proveedor")}
          className="w-full text-left flex items-start gap-2 rounded-lg border border-[var(--data-warning)]/30 bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning)] hover:bg-[var(--data-warning-100)] transition-colors"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>{stats.withoutSupplier}</strong> {stats.withoutSupplier === 1 ? "producto" : "productos"} sin proveedor anterior. La OC quedará pendiente de asignación. <span className="underline font-semibold">Ver lista</span>
          </span>
        </button>
      )}

      {/* Sections grouped by urgency, respect filter */}
      {URGENCY_ORDER.map((urgency) => {
        const items = visible.filter((s) => s.urgency === urgency);
        if (items.length === 0) return null;
        const config = URGENCY_CONFIG[urgency];
        const isCollapsed = collapsed[urgency];
        const Icon = config.icon;
        const allSelectedInUrgency = items.every((i) => selected.has(i.productId));

        return (
          <div key={urgency} className="rounded-xl border border-[var(--rule-base)] bg-white overflow-hidden">
            {/* Section header */}
            <div className={cn("flex items-center justify-between px-4 py-3 border-l-4", config.border, config.bg)}>
              <button
                type="button"
                onClick={() => toggleCollapse(urgency)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <Icon className={cn("h-4 w-4", config.text)} />
                <span className={cn("text-sm font-bold", config.text)}>{config.short}</span>
                <span className="text-xs text-[var(--text-tertiary)]">·</span>
                <span className="text-xs text-[var(--text-secondary)]">{config.label.split("—")[1]?.trim()}</span>
                <span className={cn("text-xs font-bold ml-auto sm:ml-2 px-2 py-0.5 rounded-full bg-white", config.text)}>
                  {items.length}
                </span>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => selectAllUrgency(urgency)}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-primary px-2 py-0.5 rounded"
                >
                  {allSelectedInUrgency ? "Deseleccionar" : "Seleccionar todos"}
                </button>
                <button onClick={() => toggleCollapse(urgency)} aria-label={isCollapsed ? "Expandir" : "Colapsar"}>
                  {isCollapsed ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />}
                </button>
              </div>
            </div>

            {/* Items */}
            {!isCollapsed && (
              <div className="p-3 grid gap-2 sm:grid-cols-2">
                {items.map((s) => {
                  const isSelected = selected.has(s.productId);
                  const lineTotal = s.lastPrice != null ? s.lastPrice * s.suggestedQty : null;
                  return (
                    <button
                      key={s.productId}
                      type="button"
                      onClick={() => toggleSelect(s.productId)}
                      className={cn(
                        "text-left bg-white border rounded-lg p-3 transition-all flex items-start gap-3",
                        isSelected
                          ? "border-primary ring-1 ring-primary/30 bg-primary/5"
                          : "border-[var(--rule-base)] hover:border-[var(--text-tertiary)]"
                      )}
                    >
                      {/* Checkbox */}
                      <div className={cn(
                        "mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected ? "bg-primary border-primary" : "border-[var(--rule-base)]"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[var(--text-primary)] line-clamp-1 flex-1">
                            {s.productName}
                          </span>
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] shrink-0">
                            {s.category}
                          </span>
                        </div>

                        {/* Stock info */}
                        <p className={cn("text-xs mt-1.5", config.text, "font-semibold")}>
                          Stock {s.currentStock} · Venta diaria {s.dailyAvg} · Para{" "}
                          {s.daysOfStock >= 9999 ? "muchos" : s.daysOfStock} {s.daysOfStock === 1 ? "día" : "días"}
                        </p>

                        {/* Suggested + cost */}
                        <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                          <span className="text-base font-extrabold text-[var(--text-primary)]">
                            Pedir {s.suggestedQty} {s.suggestedQty === 1 ? "unidad" : "unidades"}
                          </span>
                          {lineTotal != null && (
                            <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                              ≈ S/{lineTotal.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {/* Supplier */}
                        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-secondary)] flex-wrap">
                          {s.suggestedSupplier ? (
                            <span className="truncate">→ {s.suggestedSupplier.name}</span>
                          ) : (
                            <span className="text-[var(--data-warning)] font-semibold">⚠ Sin proveedor anterior</span>
                          )}
                          {s.lastPrice != null && (
                            <span className="text-[var(--text-tertiary)] tabular-nums">Último S/{s.lastPrice.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty filter result */}
      {visible.length === 0 && (
        <div className="text-center py-10 border-2 border-dashed border-[var(--rule-base)] rounded-xl">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">No hay sugerencias en este filtro</p>
          <button onClick={() => { setFilter("todos"); setSearch(""); }} className="mt-2 text-xs text-primary font-semibold hover:underline">
            Ver todas
          </button>
        </div>
      )}

      {/* Sticky bottom bar — solo aparece con seleccionados */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)]">
          <div className="bg-white border border-[var(--rule-base)] rounded-xl shadow-lg flex items-center gap-3 px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-[var(--text-primary)]">
                {selected.size} {selected.size === 1 ? "producto" : "productos"} · {selectedStats.qty} {selectedStats.qty === 1 ? "unidad" : "unidades"}
              </p>
              <p className="text-[var(--text-tertiary)]">
                {selectedStats.cost > 0 ? `≈ S/${Math.round(selectedStats.cost).toLocaleString("es-PE")} · ` : ""}
                Generará {selectedStats.supplierGroups} {selectedStats.supplierGroups === 1 ? "orden" : "órdenes"}
              </p>
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-1"
            >
              Limpiar
            </button>
            <button
              onClick={() => void createOCs()}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
              {creating ? "Creando..." : "Crear órdenes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
