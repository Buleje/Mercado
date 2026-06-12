"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
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
import { useCatalogFilter } from "@/components/marketplace/catalog-filter-context";
import { PRICE_BUCKETS } from "@/components/marketplace/catalog-options";
// Grid del catálogo: 1 COLUMNA en mobile (card horizontal full-width estilo
// PedidosYa — imagen 176px + nombre/precio/CTA visibles, nada cortado), grid
// vertical multi-columna desde sm. No reusa MARKETPLACE_GRID (que arranca en
// 2-col) porque el card list horizontal necesita el ancho completo en mobile.
// Catálogo en la COLUMNA CENTRAL. Brandon pidió 4 por fila en desktop ancho:
// 2 cols base → 3 en xl → 4 en pantallas anchas. Densidad sin perder
// legibilidad (las 5-6 cols originales eran diminutas).
// Brandon 2026-06-07: cards más compactas → hasta 5 por fila en desktop ancho.
const CATALOG_GRID =
  "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CatalogProduct {
  storeProductId: string;
  productId: number;
  name: string;
  /** Descripción corta — se muestra 1 línea (line-clamp) en la card. */
  description?: string | null;
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
  /** Comentarios públicos (estilo IG) del producto — Brandon 2026-06-06 */
  commentCount?: number;
  // C5 — Sponsored
  isSponsored?: boolean;
  sponsoredBoostId?: string | null;
}

type SortOption = "popular" | "price_asc" | "price_desc" | "newest" | "rating";

/* ── Adapter: CatalogProduct → UnifiedProductCard shape ───────────────────── */

function toCatalogCardProduct(product: CatalogProduct) {
  return {
    id: product.productId,
    name: product.name,
    description: product.description ?? null,
    price: product.price,
    image: product.image,
    storeName: product.storeName,
    storeSlug: product.storeSlug,
    storeId: product.storeId,
    storeProductId: product.storeProductId,
    storeRating: product.storeRating,
    storeLogo: product.storeLogo,
    unit: product.unit,
    category: product.category ?? undefined,
    stock: product.stock,
    commentCount: product.commentCount,
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
  // Categoría + orden vienen del rail IZQUIERDO (layout 3-col del marketplace)
  // vía contexto. Sin provider → estado local (otros usos / standalone).
  const filterCtx = useCatalogFilter();
  const [localSort, setLocalSort] = useState<SortOption>("popular");
  const [localCategory, setLocalCategory] = useState("todos");
  const sort = (filterCtx?.sort ?? localSort) as SortOption;
  const productCategory = filterCtx?.category ?? localCategory;
  // Vertical (tipo de tienda): viene del contexto en la HOME. "" = sin filtro.
  const vertical = filterCtx?.vertical ?? "";
  // Precio (bucket) + Tienda: vienen del contexto (rail izquierdo). En modo
  // standalone (sin provider) no hay UI para estos, así que caen a "" (sin filtro).
  const priceKey = filterCtx?.priceKey ?? "";
  const storeFilter = filterCtx?.storeSlug ?? "";
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const inFlightCursorRef = useRef<string | null>(null);

  const fetchProducts = useCallback(
    async (cursor?: string) => {
      if (cursor) {
        if (inFlightCursorRef.current === cursor) return;
        inFlightCursorRef.current = cursor;
        setLoadingMore(true);
      } else {
        inFlightCursorRef.current = null;
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        if (searchQuery?.trim()) params.set("q", searchQuery.trim());
        if (zone) params.set("zone", zone);
        if (productCategory !== "todos") params.set("category", productCategory);
        if (vertical) params.set("vertical", vertical);
        if (storeFilter) params.set("storeSlug", storeFilter);
        // Precio: el bucket activo aporta minPrice/maxPrice (el API ya los soporta).
        const bucket = PRICE_BUCKETS.find((b) => b.key === priceKey);
        if (bucket?.min != null) params.set("minPrice", String(bucket.min));
        if (bucket?.max != null) params.set("maxPrice", String(bucket.max));
        params.set("sort", sort);
        params.set("limit", "40");
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/marketplace/catalog?${params}`);
        if (!res.ok) throw new Error("Error cargando productos");
        const json = await res.json();

        if (cursor) {
          setProducts((prev) => {
            const seen = new Set(prev.map((p) => p.storeProductId));
            const incoming = (json.data ?? []).filter(
              (p: CatalogProduct) => !seen.has(p.storeProductId),
            );
            return [...prev, ...incoming];
          });
        } else {
          const data: CatalogProduct[] = json.data ?? [];
          setProducts(data);
          // Publicar las tiendas presentes para el filtro del rail. Solo cuando
          // NO hay filtro de tienda activo (si no, la lista colapsaría a 1).
          // El round-robin del API asegura que la 1ª página cubra todas.
          if (filterCtx && !storeFilter) {
            const map = new Map<string, string>();
            for (const p of data) {
              if (p.storeSlug && !map.has(p.storeSlug)) {
                map.set(p.storeSlug, p.storeName ?? p.storeSlug);
              }
            }
            filterCtx.setStores(
              Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) =>
                a.name.localeCompare(b.name, "es"),
              ),
            );
          }
        }
        setNextCursor(json.nextCursor);
        setHasMore(json.hasMore ?? false);
      } catch {
        setError("No pudimos cargar los productos. Intenta de nuevo.");
      }
      setLoading(false);
      setLoadingMore(false);
    },
    // filterCtx fuera de deps a propósito: su identidad cambia cada render
    // (provider) y setStores es estable → incluirlo dispararía refetch en loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchQuery, zone, sort, productCategory, vertical, priceKey, storeFilter]
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

  // Brandon 2026-06-12: agotados AL FONDO. Partición estable — disponibles
  // primero (en el orden que mandó el server), agotados después. Mantiene el
  // top del catálogo vivo en vez de intercalar "Sin foto + AGOTADO". Es
  // client-side sobre lo ya cargado (el server sigue mandando su orden/cursor).
  const displayProducts = useMemo(() => {
    const inStock: CatalogProduct[] = [];
    const out: CatalogProduct[] = [];
    for (const p of products) ((p.stock ?? 0) > 0 ? inStock : out).push(p);
    return [...inStock, ...out];
  }, [products]);

  const availableCount = useMemo(
    () => products.reduce((n, p) => n + ((p.stock ?? 0) > 0 ? 1 : 0), 0),
    [products],
  );

  return (
    <div className="space-y-4">
      {/* Categorías y orden viven en el rail IZQUIERDO (layout 3-col). Acá
          solo el grid de productos. */}

      {/* Result count */}
      {!loading && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
            <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{availableCount}</strong>{" "}
            {availableCount === 1 ? "producto disponible" : "productos disponibles"}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4">
          <span className="text-sm text-[var(--data-error-700)] dark:text-red-400 flex-1">{error}</span>
          <button
            onClick={() => fetchProducts()}
            className="text-xs font-bold text-[var(--data-error-600)] hover:text-red-800 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className={CATALOG_GRID}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
            >
              <div className="aspect-square bg-[var(--surface-sunken)] dark:bg-gray-800 animate-pulse" />
              <div className="p-2.5 space-y-2">
                <div className="h-4 bg-[var(--surface-sunken)] dark:bg-gray-800 rounded w-2/3 animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] dark:bg-gray-800 rounded w-full animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] dark:bg-gray-800 rounded w-1/2 animate-pulse" />
                <div className="h-8 bg-[var(--surface-sunken)] dark:bg-gray-800 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product grid */}
      {!loading && products.length > 0 && (
        <div
          ref={gridRef}
          className={CATALOG_GRID}
        >
          {displayProducts.map((product, i) => (
            <div key={product.storeProductId} className="relative">
              {product.isSponsored && (
                <div className="absolute top-2 left-2 z-20 pointer-events-none">
                  <SponsoredBadge />
                </div>
              )}
              <UnifiedProductCard
                product={toCatalogCardProduct(product)}
                variant="default"
                /* Brandon 2026-06-12: card VERTICAL compacta (foto arriba +
                   nombre + desc 1 línea + precio + agregar) para el grid 2-col,
                   en vez del horizontal. Muestra la descripción que ahora llega. */
                layout="compact"
                index={i}
                /* Brandon 2026-06-12: click en el producto → DETALLE del
                   producto, no a la tienda. id del card = productId, así que
                   armamos /marketplace/[slug]/producto/[productId] (mismo
                   patrón que StoreCatalog). El nombre de la tienda dentro del
                   card sigue llevando a la tienda. */
                href={`/marketplace/${product.storeSlug}/producto/${product.productId}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] dark:bg-gray-800 mb-4">
            <Package className="h-9 w-9 text-[var(--text-tertiary)] dark:text-gray-600" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)] dark:text-gray-300">
            No encontramos productos
          </p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-gray-500 mt-1 max-w-xs">
            Intenta cambiar los filtros o buscar algo diferente
          </p>
        </div>
      )}

      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="py-4">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <span className="text-sm text-[var(--text-secondary)] dark:text-muted font-medium">
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
