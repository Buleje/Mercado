"use client";

/**
 * CategoryQuickChips — fila de chips de filtro rápido arriba de la grilla de
 * la categoría. Mapean a filtros/orden REALES de CategoriaClient (no inventan
 * datos): En stock, 4+★ de tienda, Más baratos, Mejor valorados.
 *
 * Cada chip es un toggle: tocarlo activa; volver a tocarlo regresa al estado
 * neutro (availability "all" / minStoreRating 0 / sort "relevance").
 */

import { Check, Star, Coins, Award } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { CategoryFiltersState } from "./CategoryFilters";
import type { CategorySortKey } from "./CategoryToolbar";

interface Props {
  filters: CategoryFiltersState;
  onChange: (next: CategoryFiltersState) => void;
  sort: CategorySortKey;
  onSortChange: (s: CategorySortKey) => void;
}

function Chip({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 h-9 text-sm font-bold transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

export default function CategoryQuickChips({ filters, onChange, sort, onSortChange }: Props) {
  const inStock = filters.availability === "inStock";
  const topRatingFilter = filters.minStoreRating >= 4;
  const cheapest = sort === "price_asc";
  const bestRated = sort === "rating";

  return (
    <div
      role="group"
      aria-label="Filtros rápidos"
      className="-mx-1 mb-3 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
    >
      <Chip
        label="En stock"
        Icon={Check}
        active={inStock}
        onClick={() => onChange({ ...filters, availability: inStock ? "all" : "inStock" })}
      />
      <Chip
        label="4+ ★ tienda"
        Icon={Star}
        active={topRatingFilter}
        onClick={() => onChange({ ...filters, minStoreRating: topRatingFilter ? 0 : 4 })}
      />
      <Chip
        label="Más baratos"
        Icon={Coins}
        active={cheapest}
        onClick={() => onSortChange(cheapest ? "relevance" : "price_asc")}
      />
      <Chip
        label="Mejor valorados"
        Icon={Award}
        active={bestRated}
        onClick={() => onSortChange(bestRated ? "relevance" : "rating")}
      />
    </div>
  );
}
