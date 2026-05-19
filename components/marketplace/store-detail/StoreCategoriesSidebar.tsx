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
        // Brandon 2026-05-18: h-14 (56px) en mobile = mejor tap target premium,
        // más grande que el actual h-12 (48px). Bordes redondeados 2xl. Padding
        // px-3.5 para más respiración. Transición scale activa al tap.
        "w-full flex items-center gap-3.5 px-3.5 h-14 rounded-2xl text-left transition-all duration-150 active:scale-[0.98]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        active
          ? "bg-linear-to-r from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 ring-1 ring-white/10"
          : "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] border border-transparent hover:border-[var(--rule-soft)]",
      )}
    >
      {/* Thumbnail h-10 (40px, antes 32px) — más prominente */}
      <span className={cn(
        "shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl overflow-hidden",
        active ? "bg-white/20 ring-2 ring-white/30" : "bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]",
      )}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            width={40}
            height={40}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <Tag className={cn("h-4.5 w-4.5", active ? "text-white" : "text-[var(--text-tertiary)]")} strokeWidth={2.25} />
        )}
      </span>

      {/* Label + indicador secundario opcional */}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-extrabold capitalize truncate leading-tight">{label}</span>
        <span className={cn(
          "block text-[length:var(--ts-2xs)] font-bold mt-0.5 tabular-nums",
          active ? "text-white/85" : "text-[var(--text-tertiary)]",
        )}>
          {count} {count === 1 ? "producto" : "productos"}
        </span>
      </span>

      {/* Count badge — más grande y visible, no hace falta porque está inline arriba */}
      {active ? (
        <span aria-hidden className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/25">
          <Tag className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </span>
      ) : (
        <span
          aria-hidden
          className="shrink-0 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-black tabular-nums text-[var(--text-tertiary)] border border-[var(--rule-soft)]"
        >
          {count}
        </span>
      )}
    </button>
  );
}
