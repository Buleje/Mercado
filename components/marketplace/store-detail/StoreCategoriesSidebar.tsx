"use client";

/**
 * StoreCategoriesSidebar — lista vertical de categorías estilo Rappi/Glovo.
 *
 * Cada categoría es una fila full-width con: thumbnail circular, nombre bold,
 * contador a la derecha. Click filtra el catálogo y hace scroll suave al
 * inicio de los productos. Tap targets ≥ h-12 (44px iOS/Android).
 *
 * Versión: sidebar (desktop, sticky) — versión mobile drawer en el padre.
 */

import Image from "next/image";
import { Tag } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { StoreCategoryChip } from "./StoreCategories";

interface Props {
  categories: StoreCategoryChip[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  images?: Record<string, string>;
  /** Si true, oculta el header (para drawer mobile que ya tiene su propio header). */
  hideHeader?: boolean;
}

export default function StoreCategoriesSidebar({
  categories, activeCategory, onCategoryChange, images, hideHeader,
}: Props) {
  const total = categories.reduce((s, c) => s + c.count, 0);
  const imageMap = images ?? {};

  const handleSelect = (cat: string | null) => {
    onCategoryChange(cat);
    if (typeof document !== "undefined") {
      const target = document.getElementById("catalogo");
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    }
  };

  return (
    <nav aria-label="Categorías de la tienda" className="space-y-1">
      {!hideHeader && (
        <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] px-3 mb-2">
          Categorías
        </p>
      )}

      {/* Item: Todos */}
      <CategoryRow
        active={activeCategory === null}
        label="Todos"
        count={total}
        imageUrl={null}
        onClick={() => handleSelect(null)}
      />

      {/* Resto */}
      {categories.map((cat) => (
        <CategoryRow
          key={cat.name}
          active={activeCategory === cat.name}
          label={cat.name}
          count={cat.count}
          imageUrl={imageMap[cat.name] ?? null}
          onClick={() => handleSelect(cat.name)}
        />
      ))}
    </nav>
  );
}

// ─── Single row ──────────────────────────────────────────────────────────────

function CategoryRow({
  active, label, count, imageUrl, onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  imageUrl: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "w-full flex items-center gap-3 px-3 h-12 rounded-xl text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        active
          ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/25"
          : "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
      )}
    >
      {/* Thumbnail */}
      <span className={cn(
        "shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full overflow-hidden",
        active ? "bg-white/15" : "bg-[var(--surface-sunken)]",
      )}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            width={32}
            height={32}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <Tag className={cn("h-4 w-4", active ? "text-white" : "text-[var(--text-tertiary)]")} />
        )}
      </span>

      {/* Label */}
      <span className="flex-1 text-sm font-bold capitalize truncate">{label}</span>

      {/* Count */}
      <span className={cn(
        "shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[length:var(--ts-2xs)] font-black tabular-nums",
        active
          ? "bg-white/25 text-white"
          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
      )}>
        {count}
      </span>
    </button>
  );
}
