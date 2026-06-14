"use client";

/**
 * HomeCatalog — el bloque de compra de /marketplace embebido en la HOME, con su
 * MISMO layout (Brandon 2026-06-08, fusión /marketplace → /):
 *   · CENTRO: grid de catálogo (MarketplaceCatalogViewSection = CatalogSections +
 *     CatalogView, 5-col + scroll infinito + quick-add).
 *   · IZQUIERDA (sticky, lg+): filtros del catálogo (MarketplaceLeftRail).
 *
 * Brandon 2026-06-12: la columna DERECHA de "Publicidad" se ELIMINÓ — esos
 * banners ahora son el HERO de la home (HomeHeroBanner). Layout a 2 columnas.
 *
 * Providers auto-contenidos: CatalogFilterProvider (filtro categoría/sort) +
 * FlyToCartProvider (animación "volar al carrito"). El carrito lo da StoreProviders.
 */

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  CatalogFilterProvider,
  useCatalogFilter,
  type CatalogSort,
} from "@/components/marketplace/catalog-filter-context";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";
import { isValidVertical } from "@/lib/marketplace/verticals";

const MarketplaceCatalogViewSection = dynamic(
  () => import("@/components/marketplace/MarketplaceCatalogViewSection"),
);
// Brandon 2026-06-13: el rail IZQUIERDO fijo de filtros se reemplazó por un
// botón "Filtros" → panel (estilo AliExpress/Temu). El catálogo ocupa TODO el
// ancho (más columnas). Los filtros son los mismos (MarketplaceLeftRail dentro
// del sheet), solo que bajo demanda.
const CatalogFiltersSheet = dynamic(
  () => import("@/components/marketplace/home/CatalogFiltersSheet"),
);

/**
 * CatalogUrlSync — aplica los filtros del URL (?sort / ?cat) al catálogo de la
 * home. Reactivo: los chips del nav apuntan a /?sort=newest#catalogo y, al
 * navegar (soft-nav), este sync actualiza el orden → el grid refetcha. Reemplaza
 * a la /explorar deprecada que botaba el parámetro. Va en <Suspense> (useSearchParams).
 */
const SORT_ALIAS: Record<string, CatalogSort> = {
  popular: "popular",
  "best-sellers": "popular",
  best_sellers: "popular",
  bestsellers: "popular",
  newest: "newest",
  price_asc: "price_asc",
  price_desc: "price_desc",
  rating: "rating",
};

function CatalogUrlSync() {
  const sp = useSearchParams();
  const ctx = useCatalogFilter();
  // Brandon 2026-06-13 FIX: el `ctx` cambia identidad en CADA render (el value
  // del provider no estaba memoizado). Antes estaba en las deps de este effect,
  // así que el effect corría en cada render y RESETEABA la categoría a "todos"
  // (no hay ?cat= en el Inicio) → al clickear una categoría del rail, el
  // re-render la borraba al instante. Ahora el ctx va por REF y el effect solo
  // depende de los params de la URL → sincroniza URL→contexto, sin pisar las
  // selecciones directas del rail lateral.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const sortParam = sp.get("sort");
  const catParam = sp.get("cat") ?? sp.get("category");
  const vParam = sp.get("v");
  useEffect(() => {
    const c = ctxRef.current;
    if (!c) return;
    const mapped = sortParam ? SORT_ALIAS[sortParam.toLowerCase()] : undefined;
    if (mapped) c.setSort(mapped);
    // Categoría: si la URL la trae la aplica; si NO, la limpia (volver a "Todo").
    c.setCategory(catParam ? catParam.toLowerCase() : "todos");
    // Vertical: solo si el ?v= es válido; sino sin filtro (todo el catálogo).
    c.setVertical(isValidVertical(vParam) ? vParam!.toLowerCase() : "");
  }, [sortParam, catParam, vParam]);
  return null;
}

export default function HomeCatalog() {
  return (
    <FlyToCartProvider>
      <CatalogFilterProvider>
        <Suspense fallback={null}>
          <CatalogUrlSync />
        </Suspense>
        {/* Brandon 2026-06-13: catálogo a TODO el ancho (estilo AliExpress/Temu).
            Sin rail lateral fijo — los filtros viven en el botón "Filtros"
            (panel) de la barra superior. Más columnas de producto. */}
        <div className="w-full">
          {/* Barra superior: botón Filtros (reemplaza al rail) */}
          <div className="mb-4 flex items-center gap-2 px-1">
            <CatalogFiltersSheet />
          </div>

          {/* Grid de catálogo a ancho completo */}
          <div className="min-w-0">
            <MarketplaceCatalogViewSection />
          </div>
        </div>
      </CatalogFilterProvider>
    </FlyToCartProvider>
  );
}
