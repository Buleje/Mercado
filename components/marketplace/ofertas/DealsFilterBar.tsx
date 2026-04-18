"use client";

/**
 * DealsFilterBar — Tabs por categoria + sort dropdown + filtro de % descuento.
 * Controla el estado de filtros del grid de deals.
 */

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealCategory, DealSortKey, DealMinDiscount } from "./types";

const CATEGORY_TABS: { id: DealCategory | "todas"; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "abarrotes", label: "Abarrotes" },
  { id: "frescos", label: "Frescos" },
  { id: "bebidas", label: "Bebidas" },
  { id: "limpieza", label: "Limpieza" },
  { id: "lacteos", label: "Lacteos" },
  { id: "farmacia", label: "Farmacia" },
];

const SORT_OPTIONS: { id: DealSortKey; label: string }[] = [
  { id: "discount_desc", label: "Mayor descuento" },
  { id: "price_asc", label: "Precio menor" },
  { id: "ends_soon", label: "Termina pronto" },
  { id: "popular", label: "Mas popular" },
];

const DISCOUNT_OPTIONS: { value: DealMinDiscount | 0; label: string }[] = [
  { value: 0, label: "Todos" },
  { value: 10, label: "10%+" },
  { value: 20, label: "20%+" },
  { value: 30, label: "30%+" },
  { value: 50, label: "50%+" },
];

export interface DealsFilters {
  category: DealCategory | "todas";
  sort: DealSortKey;
  minDiscount: DealMinDiscount | 0;
}

interface DealsFilterBarProps {
  filters: DealsFilters;
  onFiltersChange: (next: DealsFilters) => void;
}

export default function DealsFilterBar({ filters, onFiltersChange }: DealsFilterBarProps) {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      role="group"
      aria-label="Filtros de ofertas"
    >
      <div className="flex flex-col gap-4">
        {/* Tabs categorias — scroll horizontal en mobile */}
        <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none">
          <div
            role="tablist"
            aria-label="Categoria de oferta"
            className="flex gap-1 px-4 sm:px-0 sm:flex-wrap"
          >
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={filters.category === tab.id}
                onClick={() => onFiltersChange({ ...filters, category: tab.id })}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
                  filters.category === tab.id
                    ? "bg-primary text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort + discount filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Sort select */}
          <div className="relative">
            <label htmlFor="deals-sort" className="sr-only">
              Ordenar por
            </label>
            <select
              id="deals-sort"
              value={filters.sort}
              onChange={(e) =>
                onFiltersChange({ ...filters, sort: e.target.value as DealSortKey })
              }
              className="appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-3 pr-8 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              aria-hidden="true"
            />
          </div>

          {/* Descuento minimo */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Descuento minimo">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Descuento:
            </span>
            {DISCOUNT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  onFiltersChange({ ...filters, minDiscount: opt.value as DealMinDiscount | 0 })
                }
                aria-pressed={filters.minDiscount === opt.value}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                  filters.minDiscount === opt.value
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
