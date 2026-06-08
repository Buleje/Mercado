"use client";

/**
 * HomeCatalog — el bloque de compra de /marketplace embebido en la HOME, con su
 * MISMO layout (Brandon 2026-06-08, fusión /marketplace → /):
 *   · CENTRO: grid de catálogo (MarketplaceCatalogViewSection = CatalogSections +
 *     CatalogView, 5-col + scroll infinito + quick-add).
 *   · DERECHA (sticky, xl+): PUBLICIDAD (MarketplaceRightRail) — los banners.
 *   · IZQUIERDA: el rail de navegación lo aporta el shell del layout
 *     (MarketplaceSideRailShell), ya habilitado para `/`.
 *
 * Providers auto-contenidos: CatalogFilterProvider (filtro categoría/sort) +
 * FlyToCartProvider (animación "volar al carrito"). El carrito lo da StoreProviders.
 */

import dynamic from "next/dynamic";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  CatalogFilterProvider,
  useCatalogFilter,
  type CatalogSort,
} from "@/components/marketplace/catalog-filter-context";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";

const MarketplaceCatalogViewSection = dynamic(
  () => import("@/components/marketplace/MarketplaceCatalogViewSection"),
);
const MarketplaceRightRail = dynamic(
  () => import("@/components/marketplace/MarketplaceRightRail"),
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
  const sortParam = sp.get("sort");
  const catParam = sp.get("cat") ?? sp.get("category");
  useEffect(() => {
    if (!ctx) return;
    const mapped = sortParam ? SORT_ALIAS[sortParam.toLowerCase()] : undefined;
    if (mapped) ctx.setSort(mapped);
    if (catParam) ctx.setCategory(catParam.toLowerCase());
  }, [ctx, sortParam, catParam]);
  return null;
}

export default function HomeCatalog() {
  return (
    <FlyToCartProvider>
      <CatalogFilterProvider>
        <Suspense fallback={null}>
          <CatalogUrlSync />
        </Suspense>
        <div className="grid w-full grid-cols-1 items-start gap-5 lg:gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* ── CENTRO: grid de catálogo ── */}
          <div className="min-w-0">
            <MarketplaceCatalogViewSection />
          </div>

          {/* ── DERECHA: publicidad (banners) — sticky, solo xl+. Se auto-oculta
               si no hay banners cargados. ── */}
          <aside
            aria-label="Publicidad"
            className="hidden xl:block xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <MarketplaceRightRail zone={null} />
          </aside>
        </div>
      </CatalogFilterProvider>
    </FlyToCartProvider>
  );
}
