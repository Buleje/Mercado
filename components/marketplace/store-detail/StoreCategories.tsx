"use client";

/**
 * StoreCategories — chips horizontales con categorías del tenant.
 *
 * "Todos" + cada categoría con count. Click en chip filtra el catálogo.
 * Scroll horizontal en mobile. Chip activo: borde teal + texto oscuro.
 */

import { cn } from "@/lib/utils";

export interface StoreCategoryChip {
  name: string;
  count: number;
}

interface StoreCategoriesProps {
  categories: StoreCategoryChip[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export default function StoreCategories({
  categories,
  activeCategory,
  onCategoryChange,
}: StoreCategoriesProps) {
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="store-categories-heading" className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-2">
          Categorías
        </p>
        <h2
          id="store-categories-heading"
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white"
        >
          Lo que vendemos
        </h2>
      </div>

      {/* Chips — horizontal scroll on mobile */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none"
        role="list"
        aria-label="Categorías del catálogo"
      >
        {/* "Todos" chip */}
        <button
          type="button"
          role="listitem"
          onClick={() => onCategoryChange(null)}
          aria-pressed={activeCategory === null}
          className={cn(
            "flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400",
            activeCategory === null
              ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
              : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white"
          )}
        >
          Todos
          <span
            className={cn(
              "text-xs",
              activeCategory === null
                ? "text-gray-300 dark:text-gray-600"
                : "text-gray-400 dark:text-gray-500"
            )}
          >
            ({categories.reduce((s, c) => s + c.count, 0)})
          </span>
        </button>

        {/* Category chips */}
        {categories.map((cat) => (
          <button
            key={cat.name}
            type="button"
            role="listitem"
            onClick={() => onCategoryChange(cat.name)}
            aria-pressed={activeCategory === cat.name}
            className={cn(
              "flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400",
              activeCategory === cat.name
                ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            {cat.name}
            <span
              className={cn(
                "text-xs",
                activeCategory === cat.name
                  ? "text-gray-300 dark:text-gray-600"
                  : "text-gray-400 dark:text-gray-500"
              )}
            >
              ({cat.count})
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
