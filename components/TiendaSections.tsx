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
const DailySpecial = dynamic(() => import("@/components/DailySpecial"), { ssr: false });
const SeasonalPromo = dynamic(() => import("@/components/SeasonalPromo"), { ssr: false });
const FlashDeals = dynamic(() => import("@/components/FlashDeals"), { ssr: false });
const PopularProducts = dynamic(() => import("@/components/PopularProducts"), { ssr: false });
const FeaturedCarousel = dynamic(() => import("@/components/FeaturedCarousel"), { ssr: false });
const CombosSection = dynamic(() => import("@/components/CombosSection"), { ssr: false });
const LastUnitsSection = dynamic(() => import("@/components/LastUnitsSection"), { ssr: false });
const CountdownBanner = dynamic(() => import("@/components/CountdownBanner"), { ssr: false });

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
}

export default function TiendaSections({
  serverProducts,
  visibleSections,
  sectionOrder,
  showEmptyPlaceholders = false,
}: TiendaSectionsProps) {
  // Use server products if available, fallback to client hook
  const hook = useStoreProducts();
  const products = serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts.length > 0 ? false : hook.isLoading;

  // Don't render anything while loading and no server data
  if (isLoading && products.length === 0) return null;

  return (
    <>
      {sectionOrder.map((key) => {
        if (!visibleSections.has(key)) return null;

        switch (key as SectionKey) {
          case "daily_special":
            return (
              <Suspense key={key} fallback={null}>
                <DailySpecial serverProducts={products} showEmpty={showEmptyPlaceholders} />
              </Suspense>
            );
          case "seasonal_promo":
            return (
              <Suspense key={key} fallback={null}>
                <SeasonalPromo serverProducts={products} showEmpty={showEmptyPlaceholders} />
              </Suspense>
            );
          case "countdown":
            return (
              <Suspense key={key} fallback={null}>
                <CountdownBanner />
              </Suspense>
            );
          case "flash_deals":
            return (
              <Suspense key={key} fallback={null}>
                <FlashDeals serverProducts={products} showEmpty={showEmptyPlaceholders} />
              </Suspense>
            );
          case "popular_products":
            return (
              <Suspense key={key} fallback={null}>
                <PopularProducts serverProducts={products} showEmpty={showEmptyPlaceholders} />
              </Suspense>
            );
          case "featured_carousel":
            return (
              <Suspense key={key} fallback={null}>
                <FeaturedCarousel serverProducts={products} showEmpty={showEmptyPlaceholders} />
              </Suspense>
            );
          case "combos":
            return (
              <Suspense key={key} fallback={null}>
                <CombosSection serverProducts={products} showEmpty={showEmptyPlaceholders} />
              </Suspense>
            );
          case "last_units":
            return (
              <Suspense key={key} fallback={null}>
                <LastUnitsSection serverProducts={products} showEmpty={showEmptyPlaceholders} />
              </Suspense>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
