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
// Brandon 2026-06-12: rail IZQUIERDO de filtros (Categorías · Precio · Tienda ·
// Ordenar) montado en la home. Existía pero quedó huérfano tras la fusión
// /marketplace → /. Solo lg+ (en mobile los filtros viven en los chips + tabs).
const MarketplaceLeftRail = dynamic(
  () => import("@/components/marketplace/MarketplaceLeftRail"),
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
        {/* Brandon 2026-06-12: la columna DERECHA de "Publicidad" se eliminó —
            esos banners ahora son el HERO de la home (HomeHeroBanner). El
            catálogo queda a 2 columnas (filtros + grid) y el grid ocupa todo el
            ancho libre. */}
        <div className="grid w-full grid-cols-1 items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8">
          {/* ── IZQUIERDA: filtros del catálogo (sticky, solo lg+). En mobile
               los filtros los aportan los chips + tabs de orden. ── */}
          <aside
            aria-label="Filtros del catálogo"
            className="hidden lg:block lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <MarketplaceLeftRail />
          </aside>

          {/* ── CENTRO: grid de catálogo (full ancho libre) ── */}
          <div className="min-w-0">
            <MarketplaceCatalogViewSection />
          </div>
        </div>
      </CatalogFilterProvider>
    </FlyToCartProvider>
  );
}
