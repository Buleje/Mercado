"use client";

/**
 * SearchHeader — Breadcrumb + titulo editorial + stats + sort dropdown +
 * boton Filtros mobile.
 *
 * Estilo Holded: tipografia extrabold, 1 rule-b, sin colores de fondo.
 * Sticky top-16 para quedar bajo el MarketplaceNavbar (h-16).
 *
 * Visual QA P1 fix 2026-04-30: TODO el archivo migrado a tokens DS
 * (--surface-canvas, --rule-soft, --text-primary/secondary/tertiary, --accent).
 * Antes 12+ instancias de bg-white/dark:bg-gray-950 + text-gray-* hardcoded.
 * Sort select migrado a h-12 + border-2 + rounded-xl segun bsm-typography-rules.
 */

import { SlidersHorizontal } from "@buleje/design-system/icons";
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
    <div className="bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Breadcrumb "Inicio › Buscar" REMOVIDO (Brandon 2026-06-08) — mismo
            criterio que /tiendas: sin nav de migajas sobre el contenido. */}

        {/* Titulo + stats */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
              {hasQuery ? (
                <>
                  Resultados para{" "}
                  <span className="text-[var(--accent)]">&ldquo;{query}&rdquo;</span>
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
                    : "opacity-100 text-[var(--text-secondary)]"
                }`}
                aria-live="polite"
                aria-atomic="true"
              >
                {total === 0 ? (
                  "Sin resultados"
                ) : (
                  <>
                    <span className="text-[var(--text-primary)] font-semibold">
                      {total.toLocaleString("es-PE")}
                    </span>{" "}
                    producto{total === 1 ? "" : "s"} en{" "}
                    <span className="text-[var(--text-primary)] font-semibold">
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
              {/* Boton Filtros — solo mobile, h-12 + border-2 (bsm rules) */}
              <button
                onClick={onOpenFilters}
                className="lg:hidden inline-flex items-center gap-2 h-12 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] hover:border-[var(--accent)] transition-colors"
                aria-label="Abrir filtros"
              >
                <SlidersHorizontal
                  className="h-4 w-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Filtros
              </button>

              {/* Sort dropdown */}
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-tertiary)] hidden sm:inline">
                  Ordenar:
                </span>
                <select
                  value={sort}
                  onChange={(e) =>
                    onSortChange(e.target.value as SearchSortKey)
                  }
                  disabled={isPending}
                  className="h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 pr-8 text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)] disabled:opacity-50 transition-colors cursor-pointer"
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
