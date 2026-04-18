"use client";

/**
 * SitemapHero — encabezado del módulo sitemap con search bar.
 *
 * Estructura:
 *   Kicker · PageTitle · subtítulo con stats inline · search bar.
 */

import { Kicker, PageTitle } from "@buleje/design-system";
import { Map, Search, X } from "@buleje/design-system/icons";

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  totalRoutes: number;
  totalCategories: number;
  totalResults: number;
}

export default function SitemapHero({
  query,
  onQueryChange,
  totalRoutes,
  totalCategories,
  totalResults,
}: Props) {
  const hasQuery = query.trim().length > 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[var(--accent)] flex items-center justify-center shrink-0 shadow-[var(--shadow-md)]">
            <Map className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <Kicker>Directorio del proyecto</Kicker>
            <PageTitle className="mt-0.5">Sitemap</PageTitle>
            <p className="text-sm text-[var(--text-tertiary)] mt-1.5">
              Todas las páginas del proyecto organizadas por contexto.{" "}
              <span className="tabular-nums text-[var(--text-secondary)]">
                {totalRoutes}
              </span>{" "}
              rutas en{" "}
              <span className="tabular-nums text-[var(--text-secondary)]">
                {totalCategories}
              </span>{" "}
              categorías · mostrando{" "}
              <span className="tabular-nums font-semibold text-[var(--text-primary)]">
                {totalResults}
              </span>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar ruta, categoría o tag..."
          aria-label="Buscar rutas del proyecto"
          className="w-full pl-11 pr-10 py-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)] transition-colors"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </section>
  );
}
