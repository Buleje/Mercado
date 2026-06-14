"use client";

/**
 * CatalogFiltersSheet — botón "Filtros" + panel (BottomSheet) con los filtros del
 * catálogo. Reemplaza al rail izquierdo fijo (Brandon 2026-06-13, estilo
 * AliExpress/Temu: catálogo a todo el ancho, filtros bajo demanda). Reusa
 * MarketplaceLeftRail (Categorías · Precio · Tienda · Ordenar) — ya cableado al
 * CatalogFilterContext, así que abre exactamente los mismos filtros.
 */

import { useState } from "react";
import { SlidersHorizontal } from "@buleje/design-system/icons";
import BottomSheet from "@/components/ui-system/BottomSheet";
import MarketplaceLeftRail from "@/components/marketplace/MarketplaceLeftRail";
import { useCatalogFilter } from "@/components/marketplace/catalog-filter-context";

export default function CatalogFiltersSheet() {
  const [open, setOpen] = useState(false);
  const filter = useCatalogFilter();
  // Conteo de filtros activos (categoría/precio/tienda). El orden no cuenta como
  // "filtro" — siempre hay uno seleccionado.
  const activeCount =
    (filter?.category && filter.category !== "todos" ? 1 : 0) +
    (filter?.priceKey ? 1 : 0) +
    (filter?.storeSlug ? 1 : 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir filtros del catálogo"
        className="inline-flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-12 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
        Filtros
        {activeCount > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-black text-white tabular-nums leading-none">
            {activeCount}
          </span>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Filtros">
        <MarketplaceLeftRail />
      </BottomSheet>
    </>
  );
}
