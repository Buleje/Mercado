"use client";

/**
 * CategoryToolbar — barra superior de la grilla: contador + sort + boton
 * mobile para abrir el drawer de filtros.
 *
 * Estilo Holded: 1 rule-soft abajo, tipografia semibold, sin shadows.
 */

import { SlidersHorizontal } from "@buleje/design-system/icons";

export type CategorySortKey =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "rating"
  | "newest";

const SORT_OPTIONS: Array<{ value: CategorySortKey; label: string }> = [
  { value: "relevance", label: "Relevancia" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "rating", label: "Mejor calificados" },
  { value: "newest", label: "Mas nuevos" },
];

interface CategoryToolbarProps {
  total: number;
  sort: CategorySortKey;
  onSortChange: (key: CategorySortKey) => void;
  onOpenFilters: () => void;
}

export default function CategoryToolbar({
  total,
  sort,
  onSortChange,
  onOpenFilters,
}: CategoryToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-4 mb-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenFilters}
          className="lg:hidden inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          aria-label="Abrir filtros"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
          Filtros
        </button>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {total}{" "}
          <span className="font-medium text-gray-500 dark:text-gray-400">
            producto{total === 1 ? "" : "s"}
          </span>
        </p>
      </div>

      <label className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 hidden sm:inline">
          Ordenar:
        </span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as CategorySortKey)}
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Ordenar productos"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
