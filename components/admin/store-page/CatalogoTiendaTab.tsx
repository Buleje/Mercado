"use client";

/**
 * Catálogo Tienda — tab dentro de "Mi Tienda Personal".
 *
 * Permite al dueño decidir qué productos del inventario se muestran en
 * la tienda individual `/t/[slug]/tienda`. Toggle por producto + bulk
 * actions + filtros (categoría chips, visible/oculto, búsqueda).
 *
 * Rediseñado 2026-05-05:
 *   - Stats cards más prominentes con colores semánticos.
 *   - Filtros: search bar + chips de categoría (no select) + pill visibilidad.
 *   - Productos: thumbnail h-14, price destacado, stock con semáforo (rojo si <10),
 *     badge de categoría, toggle h-7 w-12 alineado con Sec. y Avanzado.
 *   - Bulk actions sticky cuando hay selección.
 *   - Agrupación visual por categoría con header + counter.
 *
 * - Backend: GET/PATCH /api/store-page/catalog + /api/store-page/visibility
 * - Multi-tenant: header `x-tenant-id` respetado vía tenant-fetch.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import Image from "next/image";
import {
  Search,
  Eye,
  EyeOff,
  Package,
  Check,
  Loader2,
  X,
  AlertTriangle,
} from "@buleje/design-system/icons";
import {
  EmptyState,
  LoadingState,
} from "@buleje/design-system";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────

type CatalogItem = {
  productId: number;
  name: string;
  image: string;
  category: string;
  unit: string;
  price: number;
  stock: number | null;
  active: boolean;
  visible: boolean;
};

type FilterVisibility = "all" | "visible" | "hidden";

// ── Helpers ────────────────────────────────────────────────────────────

function formatPEN(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function stockTone(stock: number | null): "ok" | "low" | "out" | "unknown" {
  if (stock == null) return "unknown";
  if (stock <= 0) return "out";
  if (stock < 10) return "low";
  return "ok";
}

// ── Switch primitive (alineado con Sec./Avanzado: h-7 w-12) ────────────

function VisibilitySwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40",
        checked
          ? "bg-primary border-primary"
          : "bg-gray-200 dark:bg-gray-700 border-transparent",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white dark:bg-[var(--color-card)] shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

// ── Stat card local (más prominente que el del DS para este caso) ──────

function StatTile({
  label,
  value,
  total,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  total: number;
  tone: "primary" | "success" | "muted";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-4",
        tone === "primary" && "border-primary/20 bg-primary/5 dark:bg-primary/10",
        tone === "success" && "border-[var(--data-success-500)]/20 bg-[var(--data-success-500)]/5",
        tone === "muted" && "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</p>
        <Icon className={cn(
          "h-5 w-5 shrink-0",
          tone === "primary" && "text-primary",
          tone === "success" && "text-[var(--data-success-500)]",
          tone === "muted" && "text-muted",
        )} />
      </div>
      <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
        {value}
        {total > 0 && tone !== "primary" && (
          <span className="text-base font-medium text-muted ml-1">/{total}</span>
        )}
      </p>
      {total > 0 && tone !== "primary" && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all rounded-full",
                tone === "success" && "bg-[var(--data-success-500)]",
                tone === "muted" && "bg-gray-400",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-muted tabular-nums">{pct}%</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export default function CatalogoTiendaTab() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [visibilityFilter, setVisibilityFilter] = useState<FilterVisibility>("all");

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // ── Load catalog ────────────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantSlug = await resolveActiveTenantSlug();
      const res = await fetch("/api/store-page/catalog", {
        headers: { "x-tenant-id": tenantSlug },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as CatalogItem[];
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("No se pudo cargar el catálogo. Verifica tu conexión e intenta de nuevo.");
      // eslint-disable-next-line no-console
      console.error("[CatalogoTiendaTab] load error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // ── Derived: categorías + counts por categoría ─────────────────────
  const categoriesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((p) => {
      const c = p.category || "Sin categoría";
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (categoryFilter !== "todos" && (p.category || "Sin categoría") !== categoryFilter) {
        return false;
      }
      if (visibilityFilter === "visible" && !p.visible) return false;
      if (visibilityFilter === "hidden" && p.visible) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.category.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [items, categoryFilter, visibilityFilter, search]);

  // Agrupación de filtered por categoría (manteniendo orden alfabético)
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    filtered.forEach((p) => {
      const c = p.category || "Sin categoría";
      const arr = map.get(c) ?? [];
      arr.push(p);
      map.set(c, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = items.length;
    const visible = items.filter((p) => p.visible).length;
    const hidden = total - visible;
    return { total, visible, hidden };
  }, [items]);

  // ── Mutations ───────────────────────────────────────────────────────
  const patchVisibility = useCallback(
    async (productIds: number[], visible: boolean) => {
      const tenantSlug = await resolveActiveTenantSlug();
      const res = await fetch("/api/store-page/visibility", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantSlug,
        },
        body: JSON.stringify({ productIds, visible }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as {
        ok: boolean;
        updated: number;
        created: number;
        skipped: number;
      };
    },
    [],
  );

  const toggleOne = useCallback(
    async (productId: number, nextVisible: boolean) => {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.add(productId);
        return next;
      });
      // Optimistic update
      setItems((prev) =>
        prev.map((p) =>
          p.productId === productId ? { ...p, visible: nextVisible } : p,
        ),
      );
      try {
        await patchVisibility([productId], nextVisible);
      } catch (err) {
        // Rollback
        setItems((prev) =>
          prev.map((p) =>
            p.productId === productId ? { ...p, visible: !nextVisible } : p,
          ),
        );
        setToast("Error al guardar. Intenta de nuevo.");
        // eslint-disable-next-line no-console
        console.error("[CatalogoTiendaTab] toggleOne error", err);
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [patchVisibility],
  );

  const applyBulk = useCallback(
    async (visible: boolean, scope: "all" | "selected" | "filtered") => {
      let targetIds: number[] = [];
      if (scope === "all") {
        targetIds = items.map((p) => p.productId);
      } else if (scope === "filtered") {
        targetIds = filtered.map((p) => p.productId);
      } else {
        targetIds = Array.from(selected);
      }
      if (targetIds.length === 0) return;

      setBulkSaving(true);
      // Optimistic
      setItems((prev) =>
        prev.map((p) => (targetIds.includes(p.productId) ? { ...p, visible } : p)),
      );
      try {
        const result = await patchVisibility(targetIds, visible);
        setToast(
          visible
            ? `${result.updated + result.created} productos visibles`
            : `${result.updated + result.created} productos ocultos`,
        );
        setSelected(new Set());
      } catch (err) {
        await loadCatalog();
        setToast("Error en la operación. Revirtiendo.");
        // eslint-disable-next-line no-console
        console.error("[CatalogoTiendaTab] applyBulk error", err);
      } finally {
        setBulkSaving(false);
        setTimeout(() => setToast(null), 3000);
      }
    },
    [items, filtered, selected, patchVisibility, loadCatalog],
  );

  // ── Selection helpers ───────────────────────────────────────────────
  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelected(new Set(filtered.map((p) => p.productId)));
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const hasFilters = search || categoryFilter !== "todos" || visibilityFilter !== "all";
  const clearAllFilters = () => {
    setSearch("");
    setCategoryFilter("todos");
    setVisibilityFilter("all");
  };

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) {
    return <LoadingState message="Cargando catálogo..." />;
  }

  return (
    <div className="space-y-6 relative">
      {/* ── 1. STATS — más prominentes ─────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Productos" value={stats.total} total={0} tone="primary" icon={Package} />
        <StatTile label="Visibles" value={stats.visible} total={stats.total} tone="success" icon={Eye} />
        <StatTile label="Ocultos" value={stats.hidden} total={stats.total} tone="muted" icon={EyeOff} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-500)]">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── 2. TOOLBAR ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Search + visibility pill */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o categoría..."
              className="w-full pl-12 pr-12 h-12 rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-base text-[var(--text-primary)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-surface text-muted hover:text-[var(--text-primary)]"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Visibility segmented control */}
          <div className="inline-flex p-1 rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface shrink-0">
            {([
              { value: "all",     label: "Todos",         count: stats.total },
              { value: "visible", label: "Visibles",      count: stats.visible },
              { value: "hidden",  label: "Ocultos",       count: stats.hidden },
            ] as const).map((opt) => {
              const active = visibilityFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibilityFilter(opt.value as FilterVisibility)}
                  className={cn(
                    "px-3.5 h-10 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5",
                    active
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                      : "text-muted hover:text-[var(--text-primary)]"
                  )}
                >
                  {opt.label}
                  <span className={cn(
                    "text-xs font-mono tabular-nums px-1.5 py-0.5 rounded",
                    active ? "bg-primary/10 text-primary" : "bg-gray-200 dark:bg-gray-700 text-muted"
                  )}>
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category chips — visual filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCategoryFilter("todos")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-sm font-bold transition-all border-2",
              categoryFilter === "todos"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40"
            )}
          >
            Todas
            <span className={cn(
              "text-xs font-mono tabular-nums",
              categoryFilter === "todos" ? "text-white/80" : "text-muted"
            )}>
              {stats.total}
            </span>
          </button>
          {categoriesWithCount.map(([cat, count]) => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-sm font-bold transition-all border-2",
                  active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40"
                )}
              >
                {cat}
                <span className={cn(
                  "text-xs font-mono tabular-nums",
                  active ? "text-white/80" : "text-muted"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
          {hasFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-sm font-semibold text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/10 transition-colors"
            >
              <X className="h-4 w-4" />
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Resultados counter + acciones globales (cuando NO hay selección) */}
        {selected.size === 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted">
              <span className="font-bold text-[var(--text-primary)]">{filtered.length}</span> producto{filtered.length !== 1 ? "s" : ""} {hasFilters ? "filtrados" : "en total"}
              {filtered.length > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-primary font-semibold hover:underline"
                  >
                    Seleccionar todos
                  </button>
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={bulkSaving || filtered.length === 0}
                onClick={() => applyBulk(true, "filtered")}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-surface disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Mostrar {hasFilters ? "filtrados" : "todos"}
              </button>
              <button
                type="button"
                disabled={bulkSaving || filtered.length === 0}
                onClick={() => applyBulk(false, "filtered")}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-surface disabled:opacity-50"
              >
                <EyeOff className="h-4 w-4" />
                Ocultar {hasFilters ? "filtrados" : "todos"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && !loading && (
        <EmptyState
          title="Sin productos en el catálogo"
          description="Agrega productos desde Inventario y vuelve aquí para elegir cuáles mostrar."
          icon={Package}
        />
      )}

      {/* Filter empty */}
      {items.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          <Search className="h-10 w-10 mx-auto text-muted mb-3" />
          <p className="text-base font-bold text-[var(--text-primary)]">No se encontraron productos</p>
          <p className="text-sm text-muted mt-1">Probá con otros filtros o limpiá la búsqueda.</p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-4 inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* ── 3. PRODUCTOS — agrupados por categoría ─────────────────── */}
      {filtered.length > 0 && (
        <div className="space-y-5 pb-24">
          {grouped.map(([cat, prods]) => (
            <section key={cat} className="space-y-2.5">
              <header className="flex items-center justify-between gap-2 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {cat}
                </h3>
                <span className="text-xs font-mono tabular-nums text-muted">
                  {prods.filter(p => p.visible).length}/{prods.length} visibles
                </span>
              </header>
              <div className="space-y-2">
                {prods.map((p) => {
                  const isSaving = savingIds.has(p.productId);
                  const isSelected = selected.has(p.productId);
                  const tone = stockTone(p.stock);
                  return (
                    <div
                      key={p.productId}
                      className={cn(
                        "group flex items-center gap-3 p-3 rounded-2xl border-2 transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : p.visible
                            ? "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-primary/40 hover:shadow-md"
                            : "border-dashed border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface opacity-75 hover:opacity-100"
                      )}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.productId)}
                        className="h-5 w-5 rounded-md border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] accent-primary cursor-pointer shrink-0"
                        aria-label={`Seleccionar ${p.name}`}
                      />

                      {/* Thumbnail más grande */}
                      <div className={cn(
                        "relative h-14 w-14 shrink-0 rounded-xl bg-gray-100 dark:bg-surface overflow-hidden border border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
                        !p.visible && "opacity-60"
                      )}>
                        {p.image ? (
                          <Image
                            src={p.image}
                            alt={p.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-6 w-6 text-muted" />
                          </div>
                        )}
                      </div>

                      {/* Info — name, category badge, price destacado, stock con semáforo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className={cn(
                            "text-base font-bold truncate leading-tight",
                            p.visible ? "text-[var(--text-primary)]" : "text-muted"
                          )}>
                            {p.name}
                          </p>
                          {!p.visible && (
                            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)] shrink-0">
                              Oculto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-primary tabular-nums shrink-0">
                            {formatPEN(p.price)}
                          </span>
                          <span className="text-xs text-muted">·</span>
                          <span className="text-xs text-muted truncate">{p.unit || "unidad"}</span>
                          {p.stock != null && (
                            <>
                              <span className="text-xs text-muted">·</span>
                              <span className={cn(
                                "text-xs font-bold tabular-nums shrink-0 inline-flex items-center gap-1",
                                tone === "out"  && "text-[var(--data-error-500)]",
                                tone === "low"  && "text-[var(--data-warning-500)]",
                                tone === "ok"   && "text-muted",
                              )}>
                                {tone === "out" && "Sin stock"}
                                {tone === "low" && (
                                  <>
                                    <AlertTriangle className="h-3 w-3" />
                                    {p.stock} und
                                  </>
                                )}
                                {tone === "ok" && `${p.stock} und`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Toggle h-7 w-12 (alineado con resto del DS) */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isSaving && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted" />
                        )}
                        <VisibilitySwitch
                          checked={p.visible}
                          disabled={isSaving}
                          onChange={(next) => void toggleOne(p.productId, next)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── 4. STICKY BULK BAR — flota cuando hay selección ────────── */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(640px,calc(100vw-2rem))] flex items-center gap-3 px-4 py-3 rounded-2xl bg-foreground text-background shadow-[var(--shadow-xl)] border-2 border-foreground/20 animate-[fadeUp_0.2s_ease-out_both]">
          <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-lg bg-primary text-white text-xs font-bold tabular-nums">
            {selected.size}
          </span>
          <span className="text-sm font-semibold flex-1">
            seleccionado{selected.size !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={bulkSaving}
              onClick={() => applyBulk(true, "selected")}
              className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98]"
            >
              <Eye className="h-4 w-4" />
              Mostrar
            </button>
            <button
              type="button"
              disabled={bulkSaving}
              onClick={() => applyBulk(false, "selected")}
              className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl bg-background/10 hover:bg-background/20 text-background text-sm font-bold disabled:opacity-50"
            >
              <EyeOff className="h-4 w-4" />
              Ocultar
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="p-2 rounded-lg hover:bg-background/10 text-background/70 hover:text-background"
              aria-label="Limpiar selección"
            >
              <X className="h-4 w-4" />
            </button>
            {bulkSaving && (
              <Loader2 className="h-4 w-4 animate-spin text-background/70" />
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold pointer-events-none animate-[fadeDown_0.25s_ease-out_both] shadow-lg">
          <Check className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
