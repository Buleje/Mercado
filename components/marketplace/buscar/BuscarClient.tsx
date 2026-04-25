"use client";

/**
 * BuscarClient — Orchestrator de /marketplace/buscar.
 *
 * Layout Amazon-style adaptado a Buleje (minimalismo Holded):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ SearchHeader (breadcrumb + titulo editorial + stats + sort) │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ [!query] SearchSuggestions (populares + categorias + shops) │
 *   ├──────────────┬─────────────────────────────────────────────┤
 *   │ SearchFilters│ SearchResults (grid 4 cols + pagination)    │
 *   │ (sticky 240) │                                             │
 *   └──────────────┴─────────────────────────────────────────────┘
 *
 * El estado de filtros se sincroniza con la URL via router.push para que
 * el Server Component revalide con datos frescos del backend (no filtrado
 * client-only). Esto cumple la regla "totales en backend".
 *
 * Mobile: sidebar se convierte en drawer accesible.
 */

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/lib/db/marketplace-search.db";
import SearchHeader from "./SearchHeader";
import SearchFilters, { type SearchFiltersState } from "./SearchFilters";
import SearchResults from "./SearchResults";
import SearchSuggestions from "./SearchSuggestions";
import SearchEmptyState from "./SearchEmptyState";

export type SearchSortKey =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "rating"
  | "newest";

interface BuscarClientProps {
  initialQuery: string;
  initialSort: SearchSortKey;
  initialPage: number;
  initialData: SearchResult;
  initialCategories: string[];
  initialStores: string[];
  initialPriceMin?: number;
  initialPriceMax?: number;
}

const INITIAL_FILTERS = (
  categories: string[],
  stores: string[],
  priceMin?: number,
  priceMax?: number,
): SearchFiltersState => ({
  categories,
  stores,
  priceMin: priceMin ?? null,
  priceMax: priceMax ?? null,
  availability: "all",
  minRating: 0,
  zone: null,
  deliveryTime: "any",
});

export default function BuscarClient({
  initialQuery,
  initialSort,
  initialPage,
  initialData,
  initialCategories,
  initialStores,
  initialPriceMin,
  initialPriceMax,
}: BuscarClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<SearchFiltersState>(
    INITIAL_FILTERS(
      initialCategories,
      initialStores,
      initialPriceMin,
      initialPriceMax,
    ),
  );
  const [sort, setSort] = useState<SearchSortKey>(initialSort);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  /**
   * Sincroniza todos los filtros + sort con la URL para que el Server
   * Component rehaga la query en el backend.
   */
  const pushSearch = useCallback(
    (
      nextFilters: SearchFiltersState,
      nextSort: SearchSortKey,
      page = 1,
    ) => {
      const params = new URLSearchParams();

      if (initialQuery) params.set("q", initialQuery);
      if (nextSort !== "relevance") params.set("sort", nextSort);
      if (page > 1) params.set("page", String(page));

      nextFilters.categories.forEach((c) => params.append("cat", c));
      nextFilters.stores.forEach((s) => params.append("store", s));
      if (nextFilters.priceMin != null)
        params.set("min", String(nextFilters.priceMin));
      if (nextFilters.priceMax != null)
        params.set("max", String(nextFilters.priceMax));

      startTransition(() => {
        router.push(`/marketplace/buscar?${params.toString()}`);
      });
    },
    [initialQuery, router],
  );

  const handleFiltersChange = useCallback(
    (next: SearchFiltersState) => {
      setFilters(next);
      pushSearch(next, sort);
    },
    [sort, pushSearch],
  );

  const handleSortChange = useCallback(
    (next: SearchSortKey) => {
      setSort(next);
      pushSearch(filters, next);
    },
    [filters, pushSearch],
  );

  const handleReset = useCallback(() => {
    const clean = INITIAL_FILTERS([], [], undefined, undefined);
    setFilters(clean);
    setSort("relevance");
    const params = new URLSearchParams();
    if (initialQuery) params.set("q", initialQuery);
    startTransition(() => {
      router.push(`/marketplace/buscar?${params.toString()}`);
    });
  }, [initialQuery, router]);

  const hasQuery = initialQuery.length > 0;
  const hasResults = initialData.products.length > 0;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header: breadcrumb + titulo + stats + sort */}
      <SearchHeader
        query={initialQuery}
        total={initialData.total}
        storeCount={initialData.storesFacet.length}
        sort={sort}
        onSortChange={handleSortChange}
        isPending={isPending}
        onOpenFilters={() => setMobileFiltersOpen(true)}
      />

      {/* Cuerpo principal */}
      {/* max-w-[1600px] (Ola 7) — secciones amplias para mas productos visibles */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {!hasQuery ? (
          /* Sin query: sugerencias editoriales */
          <SearchSuggestions />
        ) : hasResults ? (
          /* Con query + resultados: layout 2 columnas */
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 lg:gap-8 mt-6">
            {/* Sidebar desktop — MK-03: sticky para que no se pierdan al scroll */}
            <aside
              className="hidden lg:block lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
              aria-label="Filtros de busqueda"
            >
              <SearchFilters
                storesFacet={initialData.storesFacet}
                categoriesFacet={initialData.categoriesFacet}
                filters={filters}
                onChange={handleFiltersChange}
                onReset={handleReset}
              />
            </aside>

            {/* Grid de resultados */}
            <div className="min-w-0">
              <SearchResults
                products={initialData.products}
                total={initialData.total}
                page={initialPage}
                limit={24}
                query={initialQuery}
                isPending={isPending}
              />
            </div>
          </div>
        ) : (
          /* Con query + sin resultados: empty state */
          <div className="mt-6">
            <SearchEmptyState query={initialQuery} />
          </div>
        )}
      </div>

      {/* Mobile drawer de filtros */}
      {mobileFiltersOpen && hasQuery && hasResults && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros de busqueda"
        >
          {/* Overlay */}
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileFiltersOpen(false)}
            aria-label="Cerrar filtros"
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-white dark:bg-gray-900 overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
                Filtros
              </h2>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Cerrar filtros"
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

            <SearchFilters
              storesFacet={initialData.storesFacet}
              categoriesFacet={initialData.categoriesFacet}
              filters={filters}
              onChange={(next) => {
                handleFiltersChange(next);
                setMobileFiltersOpen(false);
              }}
              onReset={() => {
                handleReset();
                setMobileFiltersOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
