"use client";

/**
 * SearchHeader — Breadcrumb + titulo editorial + stats + sort dropdown +
 * boton Filtros mobile.
 *
 * Estilo Holded: tipografia extrabold, 1 rule-b, sin colores de fondo.
 * Sticky top-16 para quedar bajo el MarketplaceNavbar (h-16).
 */

import Link from "next/link";
import { ChevronRight, SlidersHorizontal } from "@buleje/design-system/icons";
import type { SearchSortKey } from "./BuscarClient";

const SORT_OPTIONS: Array<{ value: SearchSortKey; label: string }> = [
  { value: "relevance", label: "Relevancia" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "rating", label: "Mejor calificados" },
  { value: "newest", label: "Mas nuevos" },
];

interface SearchHeaderProps {
  query: string;
  total: number;
  storeCount: number;
  sort: SearchSortKey;
  onSortChange: (key: SearchSortKey) => void;
  isPending: boolean;
  onOpenFilters: () => void;
}

export default function SearchHeader({
  query,
  total,
  storeCount,
  sort,
  onSortChange,
  isPending,
  onOpenFilters,
}: SearchHeaderProps) {
  const hasQuery = query.length > 0;

  return (
    <div className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Breadcrumb */}
        <nav aria-label="Ruta de navegacion" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
            <li>
              <Link
                href="/marketplace"
                className="hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Inicio
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
            </li>
            <li
              aria-current="page"
              className="text-gray-900 dark:text-white font-semibold"
            >
              Buscar
            </li>
          </ol>
        </nav>

        {/* Titulo + stats */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-tight">
              {hasQuery ? (
                <>
                  Resultados para{" "}
                  <span className="text-primary">&ldquo;{query}&rdquo;</span>
                </>
              ) : (
                "Buscar productos"
              )}
            </h1>

            {hasQuery && (
              <p
                className={`mt-1.5 text-sm font-medium transition-opacity duration-200 ${
                  isPending
                    ? "opacity-40"
                    : "opacity-100 text-gray-500 dark:text-gray-400"
                }`}
                aria-live="polite"
                aria-atomic="true"
              >
                {total === 0 ? (
                  "Sin resultados"
                ) : (
                  <>
                    <span className="text-gray-900 dark:text-white font-semibold">
                      {total.toLocaleString("es-PE")}
                    </span>{" "}
                    producto{total === 1 ? "" : "s"} en{" "}
                    <span className="text-gray-900 dark:text-white font-semibold">
                      {storeCount}
                    </span>{" "}
                    bodega{storeCount === 1 ? "" : "s"}
                  </>
                )}
              </p>
            )}
          </div>

          {/* Sort + Filtros mobile */}
          {hasQuery && total > 0 && (
            <div className="flex items-center gap-2 mt-3 sm:mt-0">
              {/* Boton Filtros — solo mobile */}
              <button
                onClick={onOpenFilters}
                className="lg:hidden inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                aria-label="Abrir filtros"
              >
                <SlidersHorizontal
                  className="h-3.5 w-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Filtros
              </button>

              {/* Sort dropdown */}
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 hidden sm:inline">
                  Ordenar:
                </span>
                <select
                  value={sort}
                  onChange={(e) =>
                    onSortChange(e.target.value as SearchSortKey)
                  }
                  disabled={isPending}
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 transition-opacity"
                  aria-label="Ordenar resultados"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
