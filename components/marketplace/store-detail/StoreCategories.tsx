"use client";

/**
 * StoreCategories — chips horizontales con categorías del tenant.
 *
 * Diseño: tabs minimalistas con underline accent en la activa.
 * Scroll horizontal snap en mobile. Counter en pill separada para
 * mejor lectura.
 *
 * Diseñado para vivir en sticky bar — sin headers ruidosos.
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

function ChipButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all whitespace-nowrap",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        active
          ? "bg-[var(--accent)] text-white shadow-sm"
          : "bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]",
      )}
    >
      {label}
      <span
        className={cn(
          "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[length:var(--ts-2xs)] font-black tabular-nums",
          active
            ? "bg-white/20 text-white"
            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
        )}
      >
        {count}
      </span>
    </button>
  );
}

export default function StoreCategories({
  categories,
  activeCategory,
  onCategoryChange,
}: StoreCategoriesProps) {
  if (categories.length === 0) return null;

  const total = categories.reduce((s, c) => s + c.count, 0);

  return (
    <nav
      aria-label="Categorías del catálogo"
      className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none snap-x snap-mandatory"
    >
      <ChipButton
        active={activeCategory === null}
        label="Todos"
        count={total}
        onClick={() => onCategoryChange(null)}
      />
      {categories.map((cat) => (
        <ChipButton
          key={cat.name}
          active={activeCategory === cat.name}
          label={cat.name}
          count={cat.count}
          onClick={() => onCategoryChange(cat.name)}
        />
      ))}
    </nav>
  );
}
