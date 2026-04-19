"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Package,
  Loader2,
  ArrowUp,
  Flame,
  Sparkles,
  TrendingUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import SponsoredBadge from "@/components/marketplace/SponsoredBadge";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CatalogProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
  storeZone: string | null;
  storeRating: number;
  storeCategory: string | null;
  // C5 — Sponsored
  isSponsored?: boolean;
  sponsoredBoostId?: string | null;
}

type SortOption = "popular" | "price_asc" | "price_desc" | "newest" | "rating";

const SORT_OPTIONS: { id: SortOption; label: string; icon: React.ReactNode }[] = [
  { id: "popular", label: "Populares", icon: <Flame className="h-3.5 w-3.5" /> },
  { id: "price_asc", label: "Menor precio", icon: <TrendingUp className="h-3.5 w-3.5 rotate-180" /> },
  { id: "price_desc", label: "Mayor precio", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "newest", label: "Nuevos", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "rating", label: "Mejor valorados", icon: <Star className="h-3.5 w-3.5" /> },
];

const PRODUCT_CATEGORIES = [
  { id: "todos", label: "Todo" },
  { id: "abarrotes", label: "Abarrotes" },
  { id: "bebidas", label: "Bebidas" },
  { id: "lácteos", label: "Lácteos" },
  { id: "carnes", label: "Carnes" },
  { id: "frutas", label: "Frutas" },
  { id: "verduras", label: "Verduras" },
  { id: "limpieza", label: "Limpieza" },
  { id: "snacks", label: "Snacks" },
  { id: "panadería", label: "Panadería" },
];

/* ── Adapter: CatalogProduct → UnifiedProductCard shape ───────────────────── */

function toCatalogCardProduct(product: CatalogProduct) {
  return {
    id: product.productId,
    name: product.name,
    price: product.price,
    image: product.image,
    storeName: product.storeName,
    storeSlug: product.storeSlug,
    storeId: product.storeId,
    storeProductId: product.storeProductId,
    storeRating: product.storeRating,
    unit: product.unit,
    category: product.category ?? undefined,
    stock: product.stock,
  };
}

/* ── Main Catalog View ─────────────────────────────────────────────────────── */

export default function CatalogView({
  searchQuery,
  zone,
  category: _storeCategory,
}: {
  searchQuery?: string;
  zone?: string;
  category?: string;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("popular");
  const [productCategory, setProductCategory] = useState("todos");
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchProducts = useCallback(
    async (cursor?: string) => {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        if (searchQuery?.trim()) params.set("q", searchQuery.trim());
        if (zone) params.set("zone", zone);
        if (productCategory !== "todos") params.set("category", productCategory);
        params.set("sort", sort);
        params.set("limit", "40");
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/marketplace/catalog?${params}`);
        if (!res.ok) throw new Error("Error cargando productos");
        const json = await res.json();

        if (cursor) {
          setProducts((prev) => [...prev, ...(json.data ?? [])]);
        } else {
          setProducts(json.data ?? []);
        }
        setNextCursor(json.nextCursor);
        setHasMore(json.hasMore ?? false);
      } catch {
        setError("No pudimos cargar los productos. Intenta de nuevo.");
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [searchQuery, zone, sort, productCategory]
  );

  // Initial fetch + refetch on filter changes
  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(), searchQuery ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchProducts, searchQuery]);

  // Infinite scroll
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          fetchProducts(nextCursor);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, nextCursor, fetchProducts]);

  // Scroll to top button
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Count by category for badges
  const _categoryCounts = useMemo(() => {
    if (productCategory !== "todos") return {};
    const counts: Record<string, number> = {};
    for (const p of products) {
      const cat = p.category?.toLowerCase() ?? "otros";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [products, productCategory]);

  return (
    <div className="space-y-4">
      {/* Sort pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setSort(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all shrink-0",
              sort === opt.id
                ? "bg-primary text-white border-primary shadow-md shadow-primary/25"
                : "bg-white dark:bg-card text-gray-600 dark:text-muted border-gray-200 dark:border-card-border hover:border-primary/40 hover:text-primary"
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {PRODUCT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setProductCategory(cat.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[length:var(--ts-2xs)] font-semibold whitespace-nowrap border transition-all shrink-0",
              productCategory === cat.id
                ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                : "bg-white dark:bg-card text-gray-500 dark:text-muted border-gray-200 dark:border-card-border hover:border-gray-400"
            )}
          >
            {(() => {
              const CatIcon = getProductCategoryIcon(cat.id);
              return <CatIcon className="h-3 w-3" strokeWidth={1.75} />;
            })()}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      {!loading && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-muted">
            <strong className="text-gray-900 dark:text-foreground">{products.length}</strong>{" "}
            productos disponibles
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4">
          <span className="text-sm text-red-700 dark:text-red-400 flex-1">{error}</span>
          <button
            onClick={() => fetchProducts()}
            className="text-xs font-bold text-red-600 hover:text-red-800 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
            >
              <div className="aspect-square bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="p-2.5 space-y-2">
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-2/3 animate-pulse" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full animate-pulse" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
                <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product grid */}
      {!loading && products.length > 0 && (
        <div
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          {products.map((product, i) => (
            <div key={`${product.storeId}-${product.productId}`} className="relative">
              {product.isSponsored && (
                <div className="absolute top-2 left-2 z-20 pointer-events-none">
                  <SponsoredBadge />
                </div>
              )}
              <UnifiedProductCard
                product={toCatalogCardProduct(product)}
                variant="default"
                index={i}
                href={`/marketplace/${product.storeSlug}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
            <Package className="h-9 w-9 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
            No encontramos productos
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
            Intenta cambiar los filtros o buscar algo diferente
          </p>
        </div>
      )}

      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="py-4">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <span className="text-sm text-gray-500 dark:text-muted font-medium">
              Cargando más productos…
            </span>
          </div>
        )}
      </div>

      {/* Scroll to top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 hover:bg-primary/90 hover:scale-110 active:scale-95 transition-all"
            aria-label="Volver arriba"
          >
            <ArrowUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
