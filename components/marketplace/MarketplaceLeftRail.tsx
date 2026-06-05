"use client";

/**
 * MarketplaceLeftRail — columna IZQUIERDA fija del marketplace (layout 3-col
 * tipo Facebook). Filtros FUNCIONALES del catálogo del centro (vía
 * CatalogFilterContext):
 *   · Categorías REALES — solo las que tienen ≥1 producto publicado
 *     (/api/marketplace/product-categories), con su conteo. Cero categorías
 *     decorativas (Brandon 2026-06-05).
 *   · Ordenar.
 * (Sección "Explorar" removida a pedido.)
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import { useCatalogFilter } from "@/components/marketplace/catalog-filter-context";
import { SORT_OPTIONS } from "@/components/marketplace/catalog-options";
import { cachedJson } from "@/lib/client-cache-fetch";

interface RealCategory {
  id: string;
  count: number;
}

/** "pollo-brasa" → "Pollo brasa" · "bebidas" → "Bebidas" */
function prettyLabel(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const RAIL_HEADING =
  "px-2 pb-1.5 pt-1 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]";
const RAIL_CARD =
  "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2";

export default function MarketplaceLeftRail() {
  const filter = useCatalogFilter();
  const category = filter?.category ?? "todos";
  const sort = filter?.sort ?? "popular";

  // Categorías REALES (con productos). Sin esto la lista era decorativa.
  const [categories, setCategories] = useState<RealCategory[]>([]);
  useEffect(() => {
    let cancelled = false;
    cachedJson<{ categories?: RealCategory[] }>(
      "/api/marketplace/product-categories",
      300_000,
    )
      .then((d) => {
        if (cancelled || !d) return;
        setCategories((d.categories ?? []).filter((c) => c.id && c.count > 0));
      })
      .catch(() => {/* fetch no crítico: la sección se oculta o usa fallback */});
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCount = categories.reduce((s, c) => s + c.count, 0);

  const itemBase =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors text-left";
  const itemActive = "bg-[var(--accent-soft)] text-[var(--accent)]";
  const itemIdle =
    "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
  const countBadge = (active: boolean) =>
    cn(
      "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs,0.6875rem)] font-bold tabular-nums",
      active
        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
    );

  return (
    <div className="space-y-3">
      {/* Categorías reales → filtran el catálogo del centro */}
      <nav className={RAIL_CARD} aria-label="Categorías con productos">
        <h2 className={RAIL_HEADING}>Categorías</h2>
        <ul className="space-y-0.5">
          {/* Todo */}
          <li>
            <button
              type="button"
              onClick={() => filter?.setCategory("todos")}
              aria-pressed={category === "todos"}
              className={cn(itemBase, category === "todos" ? itemActive : itemIdle)}
            >
              {(() => {
                const Icon = getProductCategoryIcon("todos");
                return <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" strokeWidth={1.75} />;
              })()}
              Todo
              {totalCount > 0 && (
                <span className={countBadge(category === "todos")}>{totalCount}</span>
              )}
            </button>
          </li>
          {categories.map((cat) => {
            const isActive = category === cat.id;
            const Icon = getProductCategoryIcon(cat.id.toLowerCase());
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() => filter?.setCategory(cat.id)}
                  aria-pressed={isActive}
                  className={cn(itemBase, isActive ? itemActive : itemIdle)}
                >
                  <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{prettyLabel(cat.id)}</span>
                  <span className={countBadge(isActive)}>{cat.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Ordenar */}
      <div className={RAIL_CARD}>
        <h2 className={RAIL_HEADING}>Ordenar</h2>
        <ul className="space-y-0.5">
          {SORT_OPTIONS.map((opt) => {
            const isActive = sort === opt.id;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => filter?.setSort(opt.id)}
                  aria-pressed={isActive}
                  className={cn(itemBase, "py-2", isActive ? itemActive : itemIdle)}
                >
                  <span className="grid h-[1.15rem] w-[1.15rem] shrink-0 place-items-center [&>svg]:h-4 [&>svg]:w-4">
                    {opt.icon}
                  </span>
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
