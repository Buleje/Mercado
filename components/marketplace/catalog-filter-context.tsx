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

/** Tienda disponible en el catálogo — la deriva CatalogView del set cargado y
    la publica acá para que el rail muestre el filtro de Tienda sin pedir un
    endpoint extra (Brandon 2026-06-12). */
export interface CatalogStoreOption {
  slug: string;
  name: string;
}

interface CatalogFilterValue {
  category: string;
  setCategory: (c: string) => void;
  sort: CatalogSort;
  setSort: (s: CatalogSort) => void;
  /** Vertical activo (Comida/Bodega/Ferretería/Electro/Farmacia). "" = sin
      filtro de vertical. En la HOME lo setea CatalogUrlSync desde `?v=`. */
  vertical: string;
  setVertical: (v: string) => void;
  /** Bucket de precio activo (key de PRICE_BUCKETS). "" = todos. */
  priceKey: string;
  setPriceKey: (k: string) => void;
  /** Slug de tienda activa. "" = todas. */
  storeSlug: string;
  setStoreSlug: (s: string) => void;
  /** Tiendas presentes en el catálogo (las publica CatalogView). */
  stores: CatalogStoreOption[];
  setStores: (s: CatalogStoreOption[]) => void;
}

const CatalogFilterContext = createContext<CatalogFilterValue | null>(null);

export function CatalogFilterProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState("todos");
  const [sort, setSort] = useState<CatalogSort>("popular");
  const [vertical, setVertical] = useState("");
  const [priceKey, setPriceKey] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [stores, setStores] = useState<CatalogStoreOption[]>([]);
  return (
    <CatalogFilterContext.Provider
      value={{
        category,
        setCategory,
        sort,
        setSort,
        vertical,
        setVertical,
        priceKey,
        setPriceKey,
        storeSlug,
        setStoreSlug,
        stores,
        setStores,
      }}
    >
      {children}
    </CatalogFilterContext.Provider>
  );
}

/** null si no hay provider (CatalogView usa estado local en ese caso). */
export function useCatalogFilter(): CatalogFilterValue | null {
  return useContext(CatalogFilterContext);
}
