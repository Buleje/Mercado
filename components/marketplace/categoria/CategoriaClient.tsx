"use client";

/**
 * CategoriaClient — Orchestrator de /marketplace/categoria/[slug].
 *
 * Layout Amazon-style adaptado a Buleje (Holded minimalist):
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ CategoryBreadcrumb (Inicio > Explorar > Limpieza...)    │
 *   ├─────────────────────────────────────────────────────────┤
 *   │ CategoryHero (kicker + h1 + stats + ilustracion)        │
 *   ├──────────────┬──────────────────────────────────────────┤
 *   │              │ CategoryToolbar (N productos · sort)     │
 *   │ CategoryFilters├──────────────────────────────────────────┤
 *   │ (sticky, 240)│ CategoryProductGrid (4 cols desktop)     │
 *   │              │                                          │
 *   │              │ Pagination (futuro)                      │
 *   └──────────────┴──────────────────────────────────────────┘
 *
 * El state de filtros vive aca y se sincroniza con URL params. Se aplica
 * client-side sobre `initialProducts` — suficiente para el MVP. Cuando la
 * escala lo pida, pasar los filtros al server via searchParams.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import type { CategoriaDef, CatalogProduct } from "@/lib/constants/marketplace-categories";
import ExplorarTracker from "@/components/marketplace/explorar/ExplorarTracker";
import CategoryHero from "./CategoryHero";
import CategoryFilters, { type CategoryFiltersState } from "./CategoryFilters";
import CategoryQuickChips from "./CategoryQuickChips";
import CategoryToolbar, { type CategorySortKey } from "./CategoryToolbar";
import CategoryProductGrid from "./CategoryProductGrid";
import CrossSellFooter from "./CrossSellFooter";

type StoreFacet = {
  id: string;
  slug: string;
  name: string;
  count: number;
  zone: string | null;
};

interface CategoriaClientProps {
  slug: string;
  categoria: CategoriaDef;
  initialProducts: CatalogProduct[];
  initialTotal: number;
  storesFacet: StoreFacet[];
  /** Query inicial pasada por searchParam ?q= — filtra el listado por
   *  nombre/descripción adicionalmente al filtro de categoría. */
  initialQuery?: string;
}

function CategoryBreadcrumb({ label }: { label: string }) {
  return (
    <nav
      aria-label="Ruta de navegacion"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-6"
    >
      <ol className="flex items-center gap-1.5 text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
        <li>
          <Link
            href="/marketplace"
            className="hover:text-[var(--text-primary)] transition-colors"
          >
            Inicio
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
        </li>
        <li>
          <Link
            href="/marketplace/explorar"
            className="hover:text-[var(--text-primary)] transition-colors"
          >
            Explorar
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
        </li>
        <li
          aria-current="page"
          className="text-[var(--text-primary)] font-semibold"
        >
          {label}
        </li>
      </ol>
    </nav>
  );
}

const INITIAL_FILTERS: CategoryFiltersState = {
  subCategoria: null,
  stores: [],
  priceMin: null,
  priceMax: null,
  availability: "all",
  minStoreRating: 0,
  zone: null,
  deliveryTime: "any",
};

function applyFilters(
  products: CatalogProduct[],
  filters: CategoryFiltersState,
  sort: CategorySortKey,
): CatalogProduct[] {
  let out = products.slice();

  // Sub-categoria (match parcial sobre Product.category o name).
  if (filters.subCategoria) {
    const needle = filters.subCategoria.toLowerCase();
    out = out.filter(
      (p) =>
        p.category.toLowerCase().includes(needle) ||
        p.name.toLowerCase().includes(needle),
    );
  }

  // Tiendas.
  if (filters.stores.length > 0) {
    const set = new Set(filters.stores);
    out = out.filter((p) => set.has(p.storeId));
  }

  // Precio.
  if (filters.priceMin != null) {
    out = out.filter((p) => p.price >= filters.priceMin!);
  }
  if (filters.priceMax != null) {
    out = out.filter((p) => p.price <= filters.priceMax!);
  }

  // Disponibilidad.
  if (filters.availability === "inStock") {
    out = out.filter((p) => (p.stock ?? 0) > 0);
  } else if (filters.availability === "outOfStock") {
    out = out.filter((p) => (p.stock ?? 0) === 0);
  }

  // Rating tienda (proxy para rating de producto — en Buleje la mayoria de
  // productos no tiene rating individual, pero la tienda si).
  if (filters.minStoreRating > 0) {
    out = out.filter((p) => p.storeRating >= filters.minStoreRating);
  }

  // Zona (substring insensitive sobre storeZone).
  if (filters.zone) {
    const z = filters.zone.toLowerCase();
    out = out.filter((p) => (p.storeZone ?? "").toLowerCase().includes(z));
  }

  // Sort.
  switch (sort) {
    case "price_asc":
      out.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      out.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      out.sort((a, b) => b.storeRating - a.storeRating);
      break;
    case "newest":
      out.sort((a, b) => b.productId - a.productId);
      break;
    case "relevance":
    default:
      // mantener orden original (ya viene por rating de tienda del server)
      break;
  }

  return out;
}

export default function CategoriaClient({
  slug,
  categoria,
  initialProducts,
  initialTotal,
  storesFacet,
  initialQuery,
}: CategoriaClientProps) {
  const [filters, setFilters] = useState<CategoryFiltersState>(INITIAL_FILTERS);
  const [sort, setSort] = useState<CategorySortKey>("relevance");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Filtro adicional por texto libre (vino del search del navbar via ?q=)
  const [query, setQuery] = useState<string>(initialQuery?.trim() ?? "");

  const filteredProducts = useMemo(() => {
    let out = applyFilters(initialProducts, filters, sort);
    const needle = query.trim().toLowerCase();
    if (needle) {
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.category.toLowerCase().includes(needle),
      );
    }
    return out;
  }, [initialProducts, filters, sort, query]);

  // Conteo de productos por subcategoría (mismo match que applyFilters) — para
  // los chips destacados del sidebar. Se calcula sobre el set completo, no el
  // filtrado, para que el usuario vea cuántos hay en cada una.
  const subCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sub of categoria.subCategorias) {
      const needle = sub.toLowerCase();
      counts[sub] = initialProducts.filter(
        (p) =>
          p.category.toLowerCase().includes(needle) ||
          p.name.toLowerCase().includes(needle),
      ).length;
    }
    return counts;
  }, [initialProducts, categoria.subCategorias]);

  const uniqueStoreCount = useMemo(() => {
    return new Set(initialProducts.map((p) => p.storeId)).size;
  }, [initialProducts]);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName={`marketplace_categoria_${slug}`} />
      <CategoryBreadcrumb label={categoria.label} />

      <CategoryHero
        categoria={categoria}
        productCount={initialTotal}
        storeCount={uniqueStoreCount}
      />

      {/* Chip "Buscando: <query>" — visible si el usuario llegó con ?q=  */}
      {query.length > 0 && (
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm">
            <span className="text-[var(--text-tertiary)]">Buscando:</span>
            <strong className="text-[var(--accent)]">&ldquo;{query}&rdquo;</strong>
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Quitar filtro de búsqueda"
              className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white text-xs font-bold hover:opacity-90"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Layout 2 columnas (sidebar + main) */}
      {/* max-w-[1760px] (Ola 7) — secciones amplias para mas productos visibles */}
      <section
        aria-label={`Productos de ${categoria.label}`}
        className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pb-16"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 lg:gap-8">
          {/* Sidebar desktop — MK-03: sticky para que no se pierdan al scroll */}
          <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            <CategoryFilters
              slug={slug}
              categoria={categoria}
              storesFacet={storesFacet}
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(INITIAL_FILTERS)}
              subCategoryCounts={subCategoryCounts}
              totalCount={initialProducts.length}
            />
          </aside>

          {/* Main */}
          <div className="min-w-0">
            <CategoryToolbar
              total={filteredProducts.length}
              sort={sort}
              onSortChange={setSort}
              onOpenFilters={() => setMobileFiltersOpen(true)}
            />

            {/* Filtros rápidos de 1 toque (mapean a filtros/orden reales). */}
            <CategoryQuickChips
              filters={filters}
              onChange={setFilters}
              sort={sort}
              onSortChange={setSort}
            />

            <CategoryProductGrid
              products={filteredProducts}
              categoria={categoria}
            />
          </div>
        </div>
      </section>

      {/* Cross-sell footer: comparador + recetas relacionadas (ENRICH-6 Ola 3) */}
      <CrossSellFooter
        categorySlug={slug}
        categoryLabel={categoria.label}
      />

      {/* Footer vive en app/marketplace/layout.tsx (persistente). */}

      {/* Mobile drawer overlay */}
      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros"
        >
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileFiltersOpen(false)}
            aria-label="Cerrar filtros"
          />
          <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-white dark:bg-gray-900 overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
                Filtros
              </h2>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Cerrar"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M4 4l8 8M12 4L4 12"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <CategoryFilters
              slug={slug}
              categoria={categoria}
              storesFacet={storesFacet}
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(INITIAL_FILTERS)}
              subCategoryCounts={subCategoryCounts}
              totalCount={initialProducts.length}
            />
          </div>
        </div>
      )}
    </div>
  );
}
