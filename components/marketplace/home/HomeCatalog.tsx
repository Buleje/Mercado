"use client";

/**
 * HomeCatalog — embebe el GRID de catálogo de productos (el que vivía en
 * /marketplace) en la HOME, completando la fusión /marketplace → / (Brandon
 * 2026-06-08).
 *
 * Es el mismo `MarketplaceCatalogViewSection` (CatalogSections + CatalogView,
 * grid con scroll infinito + self-fetch) con sus providers auto-contenidos:
 *   · CatalogFilterProvider — el filtro de categoría/sort que lee CatalogView.
 *   · FlyToCartProvider     — la animación "volar al carrito" del quick-add.
 * El carrito (useMarketplaceCart) lo aporta StoreProviders del layout (store).
 *
 * Va como sección FINAL de la home: el scroll infinito carga páginas hasta
 * agotar el catálogo (hasMore=false), y recién ahí aparecen FAQ + footer.
 */

import dynamic from "next/dynamic";
import { CatalogFilterProvider } from "@/components/marketplace/catalog-filter-context";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";

const MarketplaceCatalogViewSection = dynamic(
  () => import("@/components/marketplace/MarketplaceCatalogViewSection"),
);

export default function HomeCatalog() {
  return (
    <FlyToCartProvider>
      <CatalogFilterProvider>
        <MarketplaceCatalogViewSection />
      </CatalogFilterProvider>
    </FlyToCartProvider>
  );
}
