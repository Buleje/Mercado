"use client";

/**
 * BuscarClient — Orchestrator de /marketplace/buscar.
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ SearchHeader (breadcrumb + titulo editorial + stats + sort) │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ [!query] SearchSuggestions (populares + categorias + shops) │
 *   ├──────────────┬─────────────────────────────────────────────┤
 *   │ SearchFilters│ SearchResults (grid + pagination)           │
 *   │ (sticky 240) │                                             │
 *   └──────────────┴─────────────────────────────────────────────┘
 *
 * Cada filtro vive en el link (lib/marketplace/buscar-params.ts): tocar uno
 * hace router.push y el Server Component rehace la consulta en el backend
 * (regla "totales en backend"). Si el link cambia por fuera (atrás/adelante,
 * link compartido, búsqueda nueva) los casilleros siguen al link.
 *
 * Mobile: sidebar se convierte en drawer accesible.
 */

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/lib/db/marketplace-search.db";
import {
  FILTROS_VACIOS,
  hayFiltrosActivos,
  linkBuscar,
  type FiltrosBuscar,
  type OrdenBuscar,
  type ParamsBuscar,
} from "@/lib/marketplace/buscar-params";
import SearchHeader from "./SearchHeader";
import SearchFilters from "./SearchFilters";
import SearchResults from "./SearchResults";
import SearchSuggestions from "./SearchSuggestions";
import SearchEmptyState from "./SearchEmptyState";

export type SearchSortKey = OrdenBuscar;

interface BuscarClientProps {
  /** Lo que dice el link hoy (ya validado en el servidor). */
  params: ParamsBuscar;
  initialData: SearchResult;
}

function filtrosDe(p: ParamsBuscar): FiltrosBuscar {
  return {
    categories: p.categories,
    stores: p.stores,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    availability: p.availability,
    minRating: p.minRating,
    zone: p.zone,
  };
}

export default function BuscarClient({ params, initialData }: BuscarClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const query = params.q;

  const [filters, setFilters] = useState<FiltrosBuscar>(() => filtrosDe(params));
  const [sort, setSort] = useState<OrdenBuscar>(params.sort);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Links que armamos acá y todavía no volvieron del servidor. Si llega uno
  // que no está en la lista, vino de afuera: los casilleros siguen al link.
  const urlKey = linkBuscar(params);
  const [enviados, setEnviados] = useState<string[]>([]);
  const [visto, setVisto] = useState(urlKey);
  if (visto !== urlKey) {
    setVisto(urlKey);
    if (!enviados.includes(urlKey)) {
      setFilters(filtrosDe(params));
      setSort(params.sort);
      setEnviados([]);
    } else if (enviados[enviados.length - 1] === urlKey) {
      setEnviados([]);
    }
  }

  const ir = useCallback(
    (next: ParamsBuscar) => {
      const qs = linkBuscar(next);
      // El mismo link que ya está en pantalla no vuelve como cambio de urlKey:
      // anotarlo lo dejaría pegado y un «atrás» a él no refrescaría los casilleros.
      if (qs !== urlKey) setEnviados((e) => [...e, qs]);
      startTransition(() => {
        router.push(`/marketplace/buscar?${qs}`);
      });
    },
    [router, urlKey],
  );

  const handleFiltersChange = useCallback(
    (next: FiltrosBuscar) => {
      setFilters(next);
      ir({ ...next, q: query, sort, page: 1 });
    },
    [ir, query, sort],
  );

  const handleSortChange = useCallback(
    (next: OrdenBuscar) => {
      setSort(next);
      ir({ ...filters, q: query, sort: next, page: 1 });
    },
    [ir, query, filters],
  );

  const handleReset = useCallback(() => {
    setFilters(FILTROS_VACIOS);
    setSort("relevance");
    ir({ ...FILTROS_VACIOS, q: query, sort: "relevance", page: 1 });
  }, [ir, query]);

  const hasQuery = query.length > 0;
  const hasResults = initialData.products.length > 0;
  // Con filtros (o una página fuera de rango) y 0 resultados, el panel de
  // filtros queda a la vista: sin él no había cómo deshacer el filtro.
  const conPanel =
    hasQuery && (hasResults || hayFiltrosActivos(filtrosDe(params)) || params.page > 1);

  const filtrosProps = {
    storesFacet: initialData.storesFacet,
    categoriesFacet: initialData.categoriesFacet,
    zonesFacet: initialData.zonesFacet,
    filters,
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Header: breadcrumb + titulo + stats + sort */}
      <SearchHeader
        query={query}
        total={initialData.total}
        storeCount={initialData.storesFacet.length}
        sort={sort}
        onSortChange={handleSortChange}
        isPending={isPending}
        onOpenFilters={() => setMobileFiltersOpen(true)}
      />

      {/* Cuerpo principal */}
      {/* max-w-[1600px] (Ola 7) — secciones amplias para mas productos visibles */}
      <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {!hasQuery ? (
          /* Sin query: sugerencias editoriales */
          <SearchSuggestions />
        ) : conPanel ? (
          /* Con query + resultados (o filtros activos): layout 2 columnas */
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 lg:gap-8 mt-6">
            {/* Sidebar desktop — MK-03: sticky para que no se pierdan al scroll */}
            <aside
              className="hidden lg:block lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
              aria-label="Filtros de busqueda"
            >
              <SearchFilters
                {...filtrosProps}
                onChange={handleFiltersChange}
                onReset={handleReset}
              />
            </aside>

            {/* Grid de resultados */}
            <div className="min-w-0">
              {hasResults ? (
                <SearchResults
                  products={initialData.products}
                  total={initialData.total}
                  page={params.page}
                  limit={24}
                  params={params}
                  isPending={isPending}
                />
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6">
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    Nada coincide con estos filtros.
                  </p>
                  <button
                    onClick={handleReset}
                    className="rounded-full border-2 border-[var(--rule-base)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Con query + sin resultados: empty state */
          <div className="mt-6">
            <SearchEmptyState query={query} />
          </div>
        )}
      </div>

      {/* Mobile drawer de filtros */}
      {mobileFiltersOpen && conPanel && (
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
          <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-[var(--surface-raised)] overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
                Filtros
              </h2>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
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
              {...filtrosProps}
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
