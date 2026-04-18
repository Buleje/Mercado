"use client";

/**
 * Catálogo Tienda — tab dentro de "Mi Tienda Personal".
 *
 * Permite al dueño decidir qué productos del inventario se muestran en
 * la tienda individual `/t/[slug]/tienda`. Toggle por producto + bulk
 * actions + filtros (categoría, visible/oculto, búsqueda).
 *
 * - Backend: GET/PATCH /api/store-page/catalog + /api/store-page/visibility
 * - Multi-tenant: header `x-tenant-id` respetado vía tenant-fetch.
 * - DS: StatCard, EmptyState, LoadingState, PrimaryButton, SectionTitle.
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
  Filter,
} from "@buleje/design-system/icons";
import {
  EmptyState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
  StatCard,
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

// ── Switch primitive (minimal inline) ──────────────────────────────────

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
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40",
        checked
          ? "bg-[var(--accent)] border-[var(--accent)]"
          : "bg-gray-200 dark:bg-surface border-[var(--rule-base)]",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
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
  const [visibilityFilter, setVisibilityFilter] =
    useState<FilterVisibility>("all");

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
      setError(
        "No se pudo cargar el catálogo. Verifica tu conexión e intenta de nuevo.",
      );
      // eslint-disable-next-line no-console
      console.error("[CatalogoTiendaTab] load error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // ── Derived: categories + counts ────────────────────────────────────
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (
        categoryFilter !== "todos" &&
        p.category !== categoryFilter
      ) {
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
            p.productId === productId
              ? { ...p, visible: !nextVisible }
              : p,
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
        prev.map((p) =>
          targetIds.includes(p.productId) ? { ...p, visible } : p,
        ),
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
        // Rollback
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

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) {
    return <LoadingState message="Cargando catálogo..." />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <SectionTitle className="text-base font-bold text-foreground">
          Catálogo de tu tienda
        </SectionTitle>
        <p className="text-xs text-muted mt-1">
          Decide qué productos aparecen en tu tienda individual. Puedes
          ocultar temporalmente los que no quieres mostrar.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Total productos"
          value={String(stats.total)}
          icon={Package}
          density="compact"
        />
        <StatCard
          label="Visibles"
          value={String(stats.visible)}
          icon={Eye}
          emphasis="success"
          density="compact"
        />
        <StatCard
          label="Ocultos"
          value={String(stats.hidden)}
          icon={EyeOff}
          emphasis="neutral"
          density="compact"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--data-error)]/30 bg-[var(--data-error)]/5 p-3 text-sm text-[var(--data-error)]">
          {error}
        </div>
      )}

      {/* Toolbar: search + filters + bulk actions */}
      <div className="space-y-3">
        {/* Row 1: search + filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setSearch(e.target.value)
              }
              placeholder="Buscar producto o categoría..."
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 min-h-[44px]"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-4 w-4 text-muted shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-surface text-sm text-foreground"
            >
              <option value="todos">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={visibilityFilter}
              onChange={(e) =>
                setVisibilityFilter(e.target.value as FilterVisibility)
              }
              className="min-h-[44px] px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-surface text-sm text-foreground"
            >
              <option value="all">Todos</option>
              <option value="visible">Solo visibles</option>
              <option value="hidden">Solo ocultos</option>
            </select>
          </div>
        </div>

        {/* Row 2: bulk actions */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted font-semibold">
            {selected.size > 0
              ? `${selected.size} seleccionado${selected.size !== 1 ? "s" : ""}`
              : `${filtered.length} producto${filtered.length !== 1 ? "s" : ""}`}
          </span>

          {selected.size === 0 ? (
            <>
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-[var(--accent)] font-semibold hover:underline"
              >
                Seleccionar todos
              </button>
              <span className="text-muted">·</span>
              <button
                type="button"
                disabled={bulkSaving}
                onClick={() => applyBulk(true, "all")}
                className="px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-foreground font-semibold hover:bg-gray-50 dark:hover:bg-accent disabled:opacity-50"
              >
                Mostrar todos
              </button>
              <button
                type="button"
                disabled={bulkSaving}
                onClick={() => applyBulk(false, "all")}
                className="px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-foreground font-semibold hover:bg-gray-50 dark:hover:bg-accent disabled:opacity-50"
              >
                Ocultar todos
              </button>
            </>
          ) : (
            <>
              <PrimaryButton
                type="button"
                disabled={bulkSaving}
                onClick={() => applyBulk(true, "selected")}
                className="text-xs"
              >
                <Eye className="h-3.5 w-3.5" />
                Mostrar selección
              </PrimaryButton>
              <button
                type="button"
                disabled={bulkSaving}
                onClick={() => applyBulk(false, "selected")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-foreground font-semibold hover:bg-gray-50 dark:hover:bg-accent disabled:opacity-50"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Ocultar selección
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-muted hover:text-foreground font-semibold"
              >
                Limpiar
              </button>
            </>
          )}

          {bulkSaving && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando...
            </span>
          )}
        </div>
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
        <div className="text-center py-10 text-sm text-muted">
          No se encontraron productos con esos filtros.
        </div>
      )}

      {/* Products list */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-card overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--rule-soft)]">
            {filtered.map((p) => {
              const isSaving = savingIds.has(p.productId);
              const isSelected = selected.has(p.productId);
              return (
                <div
                  key={p.productId}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 transition-colors",
                    isSelected
                      ? "bg-[var(--accent)]/5"
                      : "hover:bg-gray-50/60 dark:hover:bg-surface/40",
                  )}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p.productId)}
                    className="h-4 w-4 rounded border-[var(--rule-base)] accent-[var(--accent)]"
                    aria-label={`Seleccionar ${p.name}`}
                  />

                  {/* Thumbnail */}
                  <div className="relative h-10 w-10 shrink-0 rounded-lg bg-gray-100 dark:bg-surface overflow-hidden">
                    {p.image ? (
                      <Image
                        src={p.image}
                        alt={p.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-4 w-4 text-muted" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {p.name}
                    </p>
                    <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] text-muted">
                      <span className="truncate">{p.category || "Sin categoría"}</span>
                      <span className="shrink-0">·</span>
                      <span className="shrink-0 tabular-nums">{formatPEN(p.price)}</span>
                      {p.stock != null && (
                        <>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">Stock: {p.stock}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Visible state label */}
                  <span
                    className={cn(
                      "hidden sm:inline text-[length:var(--ts-2xs)] font-semibold tabular-nums",
                      p.visible
                        ? "text-[var(--accent)]"
                        : "text-muted",
                    )}
                  >
                    {p.visible ? "Visible" : "Oculto"}
                  </span>

                  {/* Switch */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isSaving && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
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
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-semibold pointer-events-none animate-[fadeDown_0.25s_ease-out_both]">
          <Check className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
