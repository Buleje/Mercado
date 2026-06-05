"use client";

/**
 * CatalogFilterContext — comparte el filtro de categoría + orden del catálogo
 * entre el rail IZQUIERDO (MarketplaceLeftRail) y el catálogo del CENTRO
 * (CatalogView), que viven en columnas distintas del layout 3-col tipo
 * Facebook del marketplace. Atraviesa el límite del dynamic import.
 *
 * CatalogView funciona también SIN provider (fallback a estado local), para no
 * romper otros usos.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

export type CatalogSort = "popular" | "price_asc" | "price_desc" | "newest" | "rating";

interface CatalogFilterValue {
  category: string;
  setCategory: (c: string) => void;
  sort: CatalogSort;
  setSort: (s: CatalogSort) => void;
}

const CatalogFilterContext = createContext<CatalogFilterValue | null>(null);

export function CatalogFilterProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState("todos");
  const [sort, setSort] = useState<CatalogSort>("popular");
  return (
    <CatalogFilterContext.Provider value={{ category, setCategory, sort, setSort }}>
      {children}
    </CatalogFilterContext.Provider>
  );
}

/** null si no hay provider (CatalogView usa estado local en ese caso). */
export function useCatalogFilter(): CatalogFilterValue | null {
  return useContext(CatalogFilterContext);
}
