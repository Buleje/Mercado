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
  const handleClick = () => {
    onClick();
    // Scroll suave al inicio del catálogo después del filtrado.
    if (typeof document !== "undefined") {
      const target = document.getElementById("catalogo");
      if (target) {
        // setTimeout para que el filter aplique antes del scroll y no
        // se interrumpa la animación al cambiar el layout.
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      className={cn(
        "snap-start shrink-0 inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl px-5 py-3.5 min-w-[110px] text-base font-bold transition-all whitespace-nowrap border-2",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        "hover:-translate-y-0.5 hover:shadow-md",
        active
          ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-[0_4px_14px_rgba(0,180,166,0.35)]"
          : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]",
      )}
    >
      <span className="text-base font-bold leading-tight">{label}</span>
      <span
        className={cn(
          "inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full text-xs font-black tabular-nums",
          active
            ? "bg-white/25 text-white"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
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
      className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none snap-x snap-mandatory"
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
