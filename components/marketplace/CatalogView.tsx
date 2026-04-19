"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Star,
  Package,
  Loader2,
  ArrowUp,
  Flame,
  Heart,
  Store as StoreIcon,
  Check,
  Sparkles,
  TrendingUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { useRecentViewed } from "@/hooks/use-recent-viewed";
import { useFlyToCart } from "@/components/marketplace/FlyToCart";
import SponsoredBadge from "@/components/marketplace/SponsoredBadge";
import ShareWhatsAppButton from "@/components/marketplace/ShareWhatsAppButton";
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

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/* ── Product Card (Temu-Style) ─────────────────────────────────────────────── */

function CatalogProductCard({
  product,
  index,
}: {
  product: CatalogProduct;
  index: number;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const { addItem, byStore, updateQuantity, removeItem } = useMarketplaceCart();
  const { isInWishlist, toggle: toggleWishlist } = useWishlist();
  const { track: trackViewed } = useRecentViewed();
  const { fly } = useFlyToCart();
  const liked = isInWishlist(product.productId, product.storeSlug);

  // Cart quantity for this product
  const cartItems = byStore[product.storeId]?.items ?? [];
  const cartItem = cartItems.find((i) => i.productId === product.productId);
  const qty = cartItem?.quantity ?? 0;

  const isOutOfStock = product.stock === 0;
  const isLowStock = !isOutOfStock && product.stock > 0 && product.stock <= 5;

  const handleAdd = () => {
    if (isOutOfStock) return;
    addItem({
      storeId: product.storeId,
      storeName: product.storeName,
      storeSlug: product.storeSlug,
      storeProductId: product.storeProductId,
      productId: product.productId,
      name: product.name,
      price: product.price,
      image: product.image,
      unit: product.unit,
    });
    if (cardRef.current) fly(cardRef.current, product.image);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  const handleDecrement = () => {
    if (qty <= 1) {
      removeItem(product.storeId, product.productId);
    } else {
      updateQuantity(product.storeId, product.productId, qty - 1);
    }
  };

  return (
    <motion.article
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.6) }}
      className={cn(
        "group relative flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800",
        "hover:shadow-[var(--shadow-md)] hover:border-primary/20 hover:-translate-y-0.5",
        "transition-all duration-300",
        isOutOfStock && "opacity-60"
      )}
    >
      {/* Heart + Share buttons */}
      <div className="absolute top-2.5 right-2.5 z-10 flex flex-col gap-1.5">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist({
              productId: product.productId,
              storeSlug: product.storeSlug,
              storeName: product.storeName,
              name: product.name,
              price: product.price,
              image: product.image,
            });
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-sm border border-white/50 dark:border-gray-700/50 transition-all hover:scale-110 active:scale-95"
          aria-label={liked ? "Quitar de favoritos" : "Agregar a favoritos"}
          aria-pressed={liked}
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-colors",
              liked ? "fill-red-500 text-red-500" : "text-gray-400 dark:text-gray-500"
            )}
          />
        </button>
        <ShareWhatsAppButton
          size="sm"
          storeSlug={product.storeSlug}
          storeName={product.storeName}
          productName={product.name}
          productId={product.productId}
          price={product.price}
          className="h-8 w-8"
        />
      </div>

      {/* Badges */}
      <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1">
        {isOutOfStock && (
          <span className="rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase text-white bg-gray-500 shadow-sm">
            Agotado
          </span>
        )}
        {product.stock === 1 && !isOutOfStock && (
          <span className="rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase text-white bg-[var(--data-error)] shadow-sm">
            ¡Última!
          </span>
        )}
        {isLowStock && product.stock !== 1 && (
          <span className="rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase text-white bg-[var(--data-warning)] shadow-sm">
            ¡Solo {product.stock}!
          </span>
        )}
        {/* C5 — Sponsored badge */}
        {product.isSponsored && <SponsoredBadge />}
      </div>

      {/* Image */}
      <Link
        href={`/marketplace/${product.storeSlug}`}
        onClick={() => {
          trackViewed({
            productId: product.productId,
            storeSlug: product.storeSlug,
            storeName: product.storeName,
            name: product.name,
            price: product.price,
            image: product.image,
          });
          if (product.sponsoredBoostId) {
            fetch(`/api/marketplace/sponsored/${encodeURIComponent(product.sponsoredBoostId)}/click`, {
              method: "POST",
              keepalive: true,
            }).catch(() => {});
          }
        }}
        className="relative aspect-square overflow-hidden bg-gray-50 dark:bg-gray-800 shrink-0"
      >
        {product.image && !imgError ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" />
            )}
            <Image
              src={product.image}
              alt={product.name}
              fill
              className={cn(
                "object-cover group-hover:scale-110 transition-transform duration-500",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
              sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, (max-width: 1200px) 25vw, 20vw"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-linear-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-300 gap-2">
            <Package className="h-10 w-10" />
            <span className="text-[length:var(--ts-2xs)] font-medium text-gray-400 uppercase tracking-wider">
              Sin imagen
            </span>
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <span className="bg-gray-600/90 text-white text-[length:var(--ts-2xs)] font-bold px-3 py-1 rounded-full">
              Agotado
            </span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-col gap-1 p-2.5 sm:p-3 flex-1">
        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-base sm:text-lg font-black text-primary leading-none">
            {fmt(product.price)}
          </span>
          {product.unit && (
            <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500">
              /{product.unit}
            </span>
          )}
        </div>

        {/* Product name */}
        <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2 min-h-8">
          {product.name}
        </h3>

        {/* Store badge */}
        <Link
          href={`/marketplace/${product.storeSlug}`}
          className="flex items-center gap-1.5 mt-auto pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          {product.storeLogo ? (
            <div className="relative h-4 w-4 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
              <Image
                src={product.storeLogo}
                alt={product.storeName}
                fill
                className="object-cover"
                sizes="16px"
              />
            </div>
          ) : (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <StoreIcon className="h-2.5 w-2.5 text-primary" />
            </div>
          )}
          <span className="text-[length:var(--ts-2xs)] font-medium text-gray-500 dark:text-gray-400 truncate hover:text-primary transition-colors">
            {product.storeName}
          </span>
          {product.storeRating > 0 && (
            <span className="flex items-center gap-0.5 text-[length:var(--ts-2xs)] text-amber-500 ml-auto shrink-0">
              <Star className="h-2.5 w-2.5 fill-current" />
              {product.storeRating.toFixed(1)}
            </span>
          )}
        </Link>

        {/* Add to cart */}
        <div className="mt-2">
          {qty > 0 ? (
            <div className="flex items-center rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 overflow-hidden">
              <button
                onClick={handleDecrement}
                className="flex h-9 w-9 items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                aria-label="Reducir cantidad"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                </svg>
              </button>
              <span className="flex-1 text-center text-sm font-bold text-primary">
                {qty}
              </span>
              <button
                onClick={handleAdd}
                disabled={isOutOfStock}
                className="flex h-9 w-9 items-center justify-center text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                aria-label="Aumentar cantidad"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              disabled={isOutOfStock}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-bold transition-all",
                isOutOfStock
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                  : "bg-primary text-white hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]"
              )}
            >
              <AnimatePresence mode="wait">
                {justAdded ? (
                  <motion.span
                    key="added"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    ¡Agregado!
                  </motion.span>
                ) : (
                  <motion.span
                    key="add"
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-1"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Agregar
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
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
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4"
        >
          {products.map((product, i) => (
            <CatalogProductCard
              key={`${product.storeId}-${product.productId}`}
              product={product}
              index={i}
            />
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
