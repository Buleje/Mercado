"use client";

/**
 * TiendaSections — Single wrapper that loads products ONCE and passes
 * them to all section components as props. Eliminates the bug where
 * each section independently fetched products via useStoreProducts()
 * and got different/empty results due to cache key mismatches.
 *
 * Architecture:
 * 1. Receives serverProducts from the server page (pre-loaded, instant)
 * 2. Uses useStoreProducts as fallback only if server didn't provide data
 * 3. Passes the SAME products array to every section — no independent fetches
 */

import { Suspense } from "react";
import dynamic from "next/dynamic";
import type { Product } from "@/data/products";
import { useStoreProducts } from "@/hooks/use-store-products";

// Dynamic imports for code-splitting
const DailySpecial = dynamic(() => import("@/components/DailySpecial"), {});
const SeasonalPromo = dynamic(() => import("@/components/SeasonalPromo"), {});
const FlashDeals = dynamic(() => import("@/components/FlashDeals"), {});
const PopularProducts = dynamic(() => import("@/components/PopularProducts"), {});
const FeaturedCarousel = dynamic(() => import("@/components/FeaturedCarousel"), {});
const CombosSection = dynamic(() => import("@/components/CombosSection"), {});
const LastUnitsSection = dynamic(() => import("@/components/LastUnitsSection"), {});
const CountdownBanner = dynamic(() => import("@/components/CountdownBanner"), {});

type SectionKey =
  | "daily_special"
  | "seasonal_promo"
  | "countdown"
  | "flash_deals"
  | "popular_products"
  | "featured_carousel"
  | "combos"
  | "last_units";

interface TiendaSectionsProps {
  /** Products pre-loaded by the server — the primary data source */
  serverProducts: Product[];
  /** Which sections are visible (from admin config) */
  visibleSections: Set<string>;
  /** Order of sections (from admin config) */
  sectionOrder: string[];
  /** If true, show placeholder for empty sections (admin preview). If false, hide them (public). */
  showEmptyPlaceholders?: boolean;
  /**
   * Si true, las secciones que suelen tener fallback aleatorio (FlashDeals,
   * PopularProducts, DailySpecial, FeaturedCarousel) DEJAN de picar del
   * catalogo global cuando admin no asigno contenido. En su lugar renderizan
   * placeholder si `showEmptyPlaceholders=true`, o `null` si no.
   *
   * Regla estricta pedida por el dueno de la tienda: "si en admin no agregue
   * nada, el shopper no ve productos magicos".
   */
  strictAdminOnly?: boolean;
}

export default function TiendaSections({
  serverProducts,
  visibleSections,
  sectionOrder,
  showEmptyPlaceholders = false,
  strictAdminOnly = false,
}: TiendaSectionsProps) {
  // Use server products if available, fallback to client hook
  const hook = useStoreProducts();
  const products = serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts.length > 0 ? false : hook.isLoading;

  // Don't render anything while loading and no server data
  if (isLoading && products.length === 0) return null;

  // When rendered publicly we show "Producto no asignado"-style placeholders.
  // In admin preview the existing admin-oriented hints are kept (default variant).
  const emptyVariant: "admin" | "public" = showEmptyPlaceholders ? "public" : "admin";

  return (
    <>
      {sectionOrder.map((key) => {
        if (!visibleSections.has(key)) return null;

        switch (key as SectionKey) {
          case "daily_special":
            return (
              <Suspense key={key} fallback={null}>
                <DailySpecial serverProducts={products} showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} strictAdminOnly={strictAdminOnly} />
              </Suspense>
            );
          case "seasonal_promo":
            return (
              <Suspense key={key} fallback={null}>
                <SeasonalPromo serverProducts={products} showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} />
              </Suspense>
            );
          case "countdown":
            return (
              <Suspense key={key} fallback={null}>
                <CountdownBanner showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} />
              </Suspense>
            );
          case "flash_deals":
            return (
              <Suspense key={key} fallback={null}>
                <FlashDeals serverProducts={products} showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} strictAdminOnly={strictAdminOnly} />
              </Suspense>
            );
          case "popular_products":
            return (
              <Suspense key={key} fallback={null}>
                <PopularProducts serverProducts={products} showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} strictAdminOnly={strictAdminOnly} />
              </Suspense>
            );
          case "featured_carousel":
            return (
              <Suspense key={key} fallback={null}>
                <FeaturedCarousel serverProducts={products} showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} strictAdminOnly={strictAdminOnly} />
              </Suspense>
            );
          case "combos":
            return (
              <Suspense key={key} fallback={null}>
                <CombosSection serverProducts={products} showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} strictAdminOnly={strictAdminOnly} />
              </Suspense>
            );
          case "last_units":
            return (
              <Suspense key={key} fallback={null}>
                <LastUnitsSection serverProducts={products} showEmpty={showEmptyPlaceholders} emptyVariant={emptyVariant} />
              </Suspense>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
