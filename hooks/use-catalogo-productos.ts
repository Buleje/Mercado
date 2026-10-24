"use client";

/**
 * useCatalogoProductos — la carga de la grilla del catálogo (salió de
 * CatalogView al partirlo, 2026-10-10; misma lógica).
 *
 * Lee filtros del CatalogFilterContext (categoría, orden, vertical, precio,
 * tienda), pagina con el cursor del API y publica en el contexto los rangos de
 * precio y las tiendas presentes (para el panel de Filtros).
 *
 * `tanda`: tamaño de la 1.ª página (default 40, como siempre). Las siguientes
 * piden `tandaSiguiente`. Pueden ser funciones: se resuelven al pedir (en el
 * cliente), p. ej. «3 filas de las columnas que hay en esta pantalla». Con `cargaManual` no hay scroll infinito: la grilla
 * crece con «Ver más» (la home: así la FAQ de abajo sigue alcanzable).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCatalogFilter } from "@/components/marketplace/catalog-filter-context";
import { PRICE_BUCKETS } from "@/components/marketplace/catalog-options";
import { agotadosAlFondo, type CatalogProduct } from "@/components/marketplace/catalogo-producto";

type SortOption = "popular" | "price_asc" | "price_desc" | "newest" | "rating";
export type Tanda = number | (() => number);
const resolver = (t: Tanda) => (typeof t === "function" ? t() : t);

export interface OpcionesCatalogo {
  searchQuery?: string;
  zone?: string;
  tanda?: Tanda;
  tandaSiguiente?: Tanda;
  cargaManual?: boolean;
}

export function useCatalogoProductos({
  searchQuery,
  zone,
  tanda = 40,
  tandaSiguiente = 40,
  cargaManual = false,
}: OpcionesCatalogo) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sin provider → estado local (otros usos / standalone).
  const filterCtx = useCatalogFilter();
  const sort = (filterCtx?.sort ?? "popular") as SortOption;
  const productCategory = filterCtx?.category ?? "todos";
  const vertical = filterCtx?.vertical ?? "";
  const priceKey = filterCtx?.priceKey ?? "";
  const storeFilter = filterCtx?.storeSlug ?? "";
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
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
        params.set("limit", String(resolver(cursor ? tandaSiguiente : tanda)));
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/marketplace/catalog?${params}`);
        if (!res.ok) throw new Error("Error cargando productos");
        const json = await res.json();

        if (cursor) {
          setProducts((prev) => {
            const seen = new Set(prev.map((p) => p.storeProductId));
            const incoming = (json.data ?? []).filter((p: CatalogProduct) => !seen.has(p.storeProductId));
            return [...prev, ...incoming];
          });
        } else {
          const data: CatalogProduct[] = json.data ?? [];
          setProducts(data);
          // Rangos de precio con productos → el panel oculta los vacíos. Solo sin
          // filtro de precio activo (con uno, todo cae en 1 rango y colapsaría).
          if (filterCtx && !priceKey) {
            const present = new Set<string>();
            for (const p of data) {
              const precio = Number(p.price);
              const b = PRICE_BUCKETS.find(
                (bk) => (bk.min == null || precio >= bk.min) && (bk.max == null || precio < bk.max),
              );
              if (b) present.add(b.key);
            }
            filterCtx.setAvailablePriceKeys(PRICE_BUCKETS.filter((b) => present.has(b.key)).map((b) => b.key));
          }
          // Tiendas presentes para el filtro. Solo sin filtro de tienda activo.
          // El round-robin del API asegura que la 1.ª página cubra todas.
          if (filterCtx && !storeFilter) {
            const map = new Map<string, string>();
            for (const p of data) {
              if (p.storeSlug && !map.has(p.storeSlug)) map.set(p.storeSlug, p.storeName ?? p.storeSlug);
            }
            filterCtx.setStores(
              Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name, "es")),
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
    [searchQuery, zone, sort, productCategory, vertical, priceKey, storeFilter, tanda, tandaSiguiente],
  );

  // Carga inicial + recarga al cambiar filtros.
  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(), searchQuery ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchProducts, searchQuery]);

  // Scroll infinito (salvo carga manual).
  useEffect(() => {
    if (cargaManual || !loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) fetchProducts(nextCursor);
      },
      { rootMargin: "200px" },
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [cargaManual, hasMore, loadingMore, nextCursor, fetchProducts]);

  const cargarMas = useCallback(() => {
    if (hasMore && !loadingMore) fetchProducts(nextCursor);
  }, [hasMore, loadingMore, nextCursor, fetchProducts]);

  // Agotados AL FONDO (Brandon 2026-06-12), sobre lo ya cargado.
  const displayProducts = useMemo(() => agotadosAlFondo(products), [products]);
  const availableCount = useMemo(() => products.reduce((n, p) => n + ((p.stock ?? 0) > 0 ? 1 : 0), 0), [products]);
  const filtroActivo =
    productCategory !== "todos" || !!vertical || !!priceKey || !!storeFilter || !!searchQuery?.trim();

  return {
    products,
    displayProducts,
    availableCount,
    loading,
    loadingMore,
    error,
    hasMore,
    filtroActivo,
    loaderRef,
    cargarMas,
    reintentar: () => fetchProducts(),
  };
}
