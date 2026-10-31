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
import { formatCategoryLabel } from "@/lib/format-category";
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
  categories,
  activeCategory,
  onCategoryChange,
  images,
  hideHeader,
}: Props) {
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
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] px-3 mb-2">
          Categorías
        </p>
      )}

      {/* Item: Todos */}
      <CategoryRow
        active={activeCategory === null}
        label="Todos"
        imageUrl={null}
        onClick={() => handleSelect(null)}
      />

      {/* Resto */}
      {categories.map((cat) => (
        <CategoryRow
          key={cat.name}
          active={activeCategory === cat.name}
          label={formatCategoryLabel(cat.name)}
          imageUrl={imageMap[cat.name] ?? null}
          onClick={() => handleSelect(cat.name)}
        />
      ))}
    </nav>
  );
}

// ─── Single row ──────────────────────────────────────────────────────────────

function CategoryRow({
  active,
  label,
  imageUrl,
  onClick,
}: {
  active: boolean;
  label: string;
  imageUrl: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // Brandon 2026-06-15: filas cuadradas (rounded-none) y compactas (h-11)
        // sin contador de productos — sidebar más liviana y editorial.
        "w-full flex items-center gap-3 px-3 h-11 rounded-none text-left transition-all duration-150 active:scale-[0.98]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        active
          ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
          : "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] border border-transparent hover:border-[var(--rule-soft)]",
      )}
    >
      {/* Thumbnail cuadrado y más chico */}
      <span
        className={cn(
          "shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md overflow-hidden",
          active
            ? "bg-[var(--surface-raised)]/15 ring-1 ring-[var(--surface-raised)]/25"
            : "bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]",
        )}
      >
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
          <Tag
            className={cn(
              "h-4 w-4",
              active ? "text-[var(--surface-raised)]" : "text-[var(--text-tertiary)]",
            )}
            strokeWidth={2}
          />
        )}
      </span>

      {/* Label — solo nombre, sin contador */}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate leading-tight">{label}</span>
      </span>
    </button>
  );
}
