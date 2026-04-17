"use client";

import { useState, useEffect, useRef } from "react";
import type { Product, Category } from "@/data/products";

// ── In-memory cache keyed by tenant (shared across hook instances per tenant) ──
const cacheByTenant = new Map<string, { products: Product[]; categories: Category[] }>();
const fetchPromiseByTenant = new Map<string, Promise<void>>();

/** Detect tenant from URL: /t/:slug/tienda → slug, else "main" */
function getTenantFromUrl(): string {
  if (typeof window === "undefined") return "main";
  const match = window.location.pathname.match(/^\/t\/([^/]+)/);
  return match ? match[1] : "main";
}

/** Fetch and cache products for a tenant (pure async, no React state) */
async function ensureCached(tenant: string): Promise<{ products: Product[]; categories: Category[] }> {
  const existing = cacheByTenant.get(tenant);
  if (existing) return existing;

  // If another caller is already fetching, wait
  const pending = fetchPromiseByTenant.get(tenant);
  if (pending) {
    await pending;
    return cacheByTenant.get(tenant) ?? { products: [], categories: [] };
  }

  // Fetch from API
  const promise = (async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) {
        cacheByTenant.set(tenant, { products: [], categories: [] });
        return;
      }
      const data = await res.json();
      const list: Product[] = Array.isArray(data)
        ? data.filter((p: Product & { active?: boolean }) => p.active !== false)
        : [];

      const catSet = new Set(list.map((p) => p.category));
      const cats: Category[] = [{ id: "todos", label: "Todos", emoji: "🛒" }];
      catSet.forEach((cat) => {
        if (cat) cats.push({ id: cat.toLowerCase().replace(/\s+/g, "-"), label: cat, emoji: "📦" });
      });

      cacheByTenant.set(tenant, { products: list, categories: cats });
    } catch {
      cacheByTenant.set(tenant, { products: [], categories: [] });
    }
  })();

  fetchPromiseByTenant.set(tenant, promise);
  await promise;
  fetchPromiseByTenant.delete(tenant);

  return cacheByTenant.get(tenant) ?? { products: [], categories: [] };
}

/**
 * Hook centralizado para obtener productos del tenant activo.
 * Cache is keyed by tenant slug to prevent cross-tenant contamination.
 */
export function useStoreProducts() {
  const tenant = getTenantFromUrl();
  const cached = cacheByTenant.get(tenant);
  const [products, setProducts] = useState<Product[]>(cached?.products ?? []);
  const [categories, setCategories] = useState<Category[]>(cached?.categories ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // If cached, the initial state already has the data — just ensure loading is false
    if (cacheByTenant.has(tenant)) return;

    // Fetch asynchronously
    ensureCached(tenant).then((result) => {
      if (cancelled || !mountedRef.current) return;
      setProducts(result.products);
      setCategories(result.categories);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [tenant]);

  return { products, categories, isLoading };
}

/**
 * Pre-populate the cache with server-loaded products.
 * Call this BEFORE any useStoreProducts() hook mounts to prevent
 * the flash-of-empty-content during hydration.
 */
export function hydrateStoreProductsCache(tenantSlug: string, products: Product[]) {
  if (cacheByTenant.has(tenantSlug)) return; // don't overwrite if already cached
  const catSet = new Set(products.map((p) => p.category));
  const cats: Category[] = [{ id: "todos", label: "Todos", emoji: "🛒" }];
  catSet.forEach((cat) => {
    if (cat) cats.push({ id: cat.toLowerCase().replace(/\s+/g, "-"), label: cat, emoji: "📦" });
  });
  cacheByTenant.set(tenantSlug, { products, categories: cats });
}

/**
 * Invalidar el cache (llamar cuando el tenant cambia o se agrega un producto).
 */
export function invalidateStoreProductsCache(tenantSlug?: string) {
  if (tenantSlug) {
    cacheByTenant.delete(tenantSlug);
    fetchPromiseByTenant.delete(tenantSlug);
  } else {
    cacheByTenant.clear();
    fetchPromiseByTenant.clear();
  }
}
