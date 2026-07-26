"use client";

/**
 * DealsFilterBar — Tabs categoria + sort dropdown + filtro % descuento.
 *
 * Estilo Buleje: tokens estrictos, chips Holded (border + accent on active),
 * sticky debajo del navbar (top-16) con backdrop blur.
 */

import { ChevronDown } from "@buleje/design-system/icons";
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
      role="group"
      aria-label="Filtros de ofertas"
      className="sticky top-16 z-30 backdrop-blur-md bg-[var(--surface-canvas)]/85 border-b border-[var(--rule-soft)] py-3"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          {/* Tabs categorias — scroll horizontal en mobile */}
          <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none">
            <div
              role="tablist"
              aria-label="Categoria de oferta"
              className="flex gap-2 px-4 sm:px-0 sm:flex-wrap"
            >
              {CATEGORY_TABS.map((tab) => {
                const active = filters.category === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onFiltersChange({ ...filters, category: tab.id })}
                    className={cn(
                      "shrink-0 inline-flex items-center rounded-full px-4 py-2 text-[length:var(--ts-sm)] font-bold whitespace-nowrap transition-colors",
                      // Visual QA P1 fix 2026-04-30: border-2 explicito segun bsm-typography-rules
                      "border-2",
                      active
                        ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-[var(--text-primary)]"
                        : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-primary/10",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort + descuento — fila secundaria */}
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
                className="appearance-none h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-3 pr-9 text-[length:var(--ts-sm)] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
                strokeWidth={2}
                aria-hidden
              />
            </div>

            {/* Descuento mínimo */}
            <div
              className="flex items-center gap-1.5 flex-wrap"
              role="group"
              aria-label="Descuento mínimo"
            >
              <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] mr-1">
                Descuento:
              </span>
              {DISCOUNT_OPTIONS.map((opt) => {
                const active = filters.minDiscount === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        minDiscount: opt.value as DealMinDiscount | 0,
                      })
                    }
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center rounded-md px-2.5 py-1 text-[length:var(--ts-xs)] font-bold tabular-nums transition-colors border",
                      active
                        ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] border-[var(--accent)]/30"
                        : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--rule-mid)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
