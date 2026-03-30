"use client";

import { useState, useEffect, useCallback } from "react";
import type { Product, Category } from "@/data/products";

// ── In-memory cache (shared across all hook instances in the same session) ──
let cachedProducts: Product[] | null = null;
let cachedCategories: Category[] | null = null;
let fetchPromise: Promise<void> | null = null;

/**
 * Hook centralizado para obtener productos del tenant activo.
 * Hace fetch a /api/products (filtrado por tenantId via proxy).
 * NUNCA cae en fallback a data/products.ts — si el tenant no tiene productos, retorna [].
 */
export function useStoreProducts() {
  const [products, setProducts] = useState<Product[]>(cachedProducts ?? []);
  const [categories, setCategories] = useState<Category[]>(cachedCategories ?? []);
  const [isLoading, setIsLoading] = useState(cachedProducts === null);

  const load = useCallback(async () => {
    // If already cached, use it
    if (cachedProducts !== null) {
      setProducts(cachedProducts);
      setCategories(cachedCategories ?? []);
      setIsLoading(false);
      return;
    }

    // If another instance is already fetching, wait for it
    if (fetchPromise) {
      await fetchPromise;
      setProducts(cachedProducts ?? []);
      setCategories(cachedCategories ?? []);
      setIsLoading(false);
      return;
    }

    // Fetch from API
    fetchPromise = (async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) {
          cachedProducts = [];
          cachedCategories = [];
          return;
        }
        const data = await res.json();
        const list: Product[] = Array.isArray(data)
          ? data.filter((p: Product) => p.active !== false)
          : [];

        cachedProducts = list;

        // Derive categories from actual products
        const catSet = new Set(list.map((p) => p.category));
        const defaultCats: Category[] = [
          { id: "todos", label: "Todos", emoji: "🛒" },
        ];
        catSet.forEach((cat) => {
          if (cat) defaultCats.push({ id: cat.toLowerCase().replace(/\s+/g, "-"), label: cat, emoji: "📦" });
        });
        cachedCategories = defaultCats;
      } catch {
        cachedProducts = [];
        cachedCategories = [];
      }
    })();

    await fetchPromise;
    fetchPromise = null;
    setProducts(cachedProducts ?? []);
    setCategories(cachedCategories ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { products, categories, isLoading };
}

/**
 * Invalidar el cache (llamar cuando el tenant cambia o se agrega un producto).
 */
export function invalidateStoreProductsCache() {
  cachedProducts = null;
  cachedCategories = null;
  fetchPromise = null;
}
