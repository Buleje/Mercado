"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/data/products";
import { hydrateStoreProductsCache } from "@/hooks/use-store-products";

/**
 * Pre-populates useStoreProducts cache with server-loaded products.
 * Prevents flash-of-empty-content during client hydration.
 *
 * Uses useState initializer (runs once synchronously during first render)
 * to seed the cache before any useStoreProducts hook reads it.
 */
export default function StoreProductsHydrator({
  tenantSlug,
  products,
}: {
  tenantSlug: string;
  products: Product[];
}) {
  // useState initializer runs synchronously on first render — before effects
  useState(() => {
    if (products.length > 0) {
      hydrateStoreProductsCache(tenantSlug, products);
    }
  });

  // Also hydrate on prop changes (navigation between tenants)
  useEffect(() => {
    if (products.length > 0) {
      hydrateStoreProductsCache(tenantSlug, products);
    }
  }, [tenantSlug, products]);

  return null;
}
