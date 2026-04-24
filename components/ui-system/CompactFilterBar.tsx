"use client";

/**
 * CompactFilterBar — Barra de filtros en chips horizontal-scroll.
 *
 * Reemplaza sidebars de filtros en mobile. Cada filter es un chip que
 * abre un BottomSheet/Popover con opciones. Al aplicar se muestra el
 * count de opciones seleccionadas en el chip.
 *
 * Uso:
 *   <CompactFilterBar
 *     filters={[
 *       { id: "precio", label: "Precio", count: priceRange.length, onClick: () => openSheet("precio") },
 *       { id: "tienda", label: "Tienda", count: stores.length, onClick: ... },
 *       { id: "oferta", label: "En oferta", active: onlyOffers, onClick: () => setOnlyOffers(!onlyOffers) },
 *     ]}
 *     activeCount={totalActiveFilters}
 *     onClearAll={clearAll}
 *   />
 */

import { ChevronDown, X, SlidersHorizontal } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface FilterChip {
  id: string;
  label: string;
  /** Si es toggle (on/off), usa active */
  active?: boolean;
  /** Si es multi-select, usa count >0 para mostrar badge */
  count?: number;
  onClick: () => void;
  /** Remove opcional (para chips ya aplicados) */
  onRemove?: () => void;
  /** No mostrar flecha (cuando es un toggle) */
  hideCaret?: boolean;
}

interface Props {
  filters: FilterChip[];
  /** Total de filtros aplicados (para "Limpiar N filtros") */
  activeCount?: number;
  onClearAll?: () => void;
  /** CTA "Mas filtros" para abrir sheet con todas las opciones */
  onOpenAllFilters?: () => void;
  className?: string;
}

export default function CompactFilterBar({
  filters,
  activeCount = 0,
  onClearAll,
  onOpenAllFilters,
  className,
}: Props) {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto no-scrollbar", className)}>
      {onOpenAllFilters && (
        <button
          type="button"
          onClick={onOpenAllFilters}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border transition-colors",
            "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)]",
            "hover:border-[var(--accent)]",
            "text-xs font-bold",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Filtros
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] text-[length:var(--ts-2xs)] font-bold px-1 tabular-nums">
              {activeCount}
            </span>
          )}
        </button>
      )}

      {filters.map((f) => {
        const isActive = f.active || (f.count ?? 0) > 0;
        return (
          <div key={f.id} className="shrink-0 relative inline-flex">
            <button
              type="button"
              onClick={f.onClick}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border transition-colors text-xs font-bold",
                isActive
                  ? "bg-[var(--text-primary)] border-[var(--text-primary)] text-[var(--surface-canvas)]"
                  : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]",
              )}
            >
              {f.label}
              {(f.count ?? 0) > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full text-[length:var(--ts-2xs)] font-bold px-1 tabular-nums",
                    isActive ? "bg-[var(--surface-canvas)] text-[var(--text-primary)]" : "bg-[var(--accent-soft)] text-[var(--accent)]",
                  )}
                >
                  {f.count}
                </span>
              )}
              {!f.hideCaret && !f.onRemove && (
                <ChevronDown className="h-3 w-3 opacity-70" strokeWidth={2.5} aria-hidden />
              )}
            </button>
            {f.onRemove && isActive && (
              <button
                type="button"
                onClick={f.onRemove}
                aria-label={`Quitar filtro ${f.label}`}
                className={cn(
                  "absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--data-error,_#e11d48)] text-white",
                  "inline-flex items-center justify-center shadow-sm hover:scale-110 transition-transform",
                )}
              >
                <X className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
              </button>
            )}
          </div>
        );
      })}

      {activeCount > 0 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="shrink-0 inline-flex items-center gap-1 h-9 px-3 text-xs font-bold text-[var(--data-error,_#e11d48)] hover:underline"
        >
          <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          Limpiar
        </button>
      )}
    </div>
  );
}
