"use client";

/**
 * StoreCategories — chips horizontales con categorías del tenant.
 *
 * Dos modos de render:
 *   1. **Default** (sin imágenes): chip cuadrado con label + count.
 *   2. **Imagen+texto**: si la categoría tiene imagen (per-store o global),
 *      se rendea con thumbnail 56×56 + label debajo.
 *
 * Variante `compact`:
 *   - Cuando el bar está sticky scrolling, los chips pasan a horizontales
 *     (rectangulares más bajos: h-10 vs h-16-20).
 *
 * Diseñado para vivir en sticky bar — sin headers ruidosos.
 */

import Image from "next/image";
import { cn } from "@/lib/utils";

export interface StoreCategoryChip {
  name: string;
  count: number;
}

interface StoreCategoriesProps {
  categories: StoreCategoryChip[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  /** Mapa name → URL imagen (resolved: per-store > global > undefined) */
  images?: Record<string, string>;
  /** Render compacto (rectangular bajo, para sticky scrolling). Default: false */
  compact?: boolean;
}

interface ChipButtonProps {
  active: boolean;
  label: string;
  count: number;
  imageUrl?: string;
  compact?: boolean;
  onClick: () => void;
}

function ChipButton({ active, label, count, imageUrl, compact, onClick }: ChipButtonProps) {
  const handleClick = () => {
    onClick();
    // Scroll suave al inicio del catálogo después del filtrado.
    if (typeof document !== "undefined") {
      const target = document.getElementById("catalogo");
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
    }
  };

  // ── Variant: COMPACT (sticky scrolling) ─────────────────────────────
  // Rectangular bajo (h-10), horizontal, sin imagen grande aunque haya.
  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={active}
        className={cn(
          "snap-start shrink-0 inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-bold transition-all whitespace-nowrap border-2",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          "hover:-translate-y-0.5 hover:shadow-md",
          active
            ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-[0_2px_10px_rgba(0,180,166,0.30)]"
            : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]",
        )}
      >
        {imageUrl && (
          <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="20px"
              className="object-cover"
              unoptimized
              priority
            />
          </span>
        )}
        <span className="text-sm font-bold">{label}</span>
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-black tabular-nums",
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

  // ── Variant: IMAGE + TEXT (cuando hay imagen disponible) ────────────
  if (imageUrl) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={active}
        className={cn(
          "snap-start shrink-0 inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-3 min-w-[96px] text-base font-bold transition-all whitespace-nowrap border-2",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          "hover:-translate-y-0.5 hover:shadow-md",
          active
            ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-[0_4px_14px_rgba(0,180,166,0.35)]"
            : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]",
        )}
      >
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
            priority
          />
        </span>
        <span className="text-sm font-bold leading-tight">{label}</span>
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[length:var(--ts-xs)] font-black tabular-nums",
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

  // ── Variant: TEXT ONLY (default, sin imagen) ────────────────────────
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
  images,
  compact,
}: StoreCategoriesProps) {
  if (categories.length === 0) return null;

  const total = categories.reduce((s, c) => s + c.count, 0);
  const imageMap = images ?? {};

  return (
    <nav
      aria-label="Categorías del catálogo"
      className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none snap-x snap-mandatory"
    >
      <ChipButton
        active={activeCategory === null}
        label="Todos"
        count={total}
        compact={compact}
        onClick={() => onCategoryChange(null)}
      />
      {categories.map((cat) => (
        <ChipButton
          key={cat.name}
          active={activeCategory === cat.name}
          label={cat.name}
          count={cat.count}
          imageUrl={imageMap[cat.name]}
          compact={compact}
          onClick={() => onCategoryChange(cat.name)}
        />
      ))}
    </nav>
  );
}
