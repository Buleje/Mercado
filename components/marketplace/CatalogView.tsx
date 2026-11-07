"use client";

/**
 * CatalogView — la grilla del catálogo de la home («Todo el mercado»).
 *
 * Rediseño «Dosel» (2026-10-10): tarjeta HomeProductCard (precio arriba, «+»
 * que se vuelve contador, sin «Stock: 999»), columnas 2 → 3 → 4 → 5 → 6 y un
 * esqueleto con la misma forma. La carga vive en hooks/use-catalogo-productos.
 * Con `cargaManual` la grilla crece con «Ver más» en vez de scroll infinito.
 */

import { useEffect, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Loader2, Package } from "@buleje/design-system/icons";
import HomeProductCard from "@/components/marketplace/home/HomeProductCard";
import SponsoredBadge from "@/components/marketplace/SponsoredBadge";
import { hrefDeProducto, toCatalogCardProduct } from "@/components/marketplace/catalogo-producto";
import { useCatalogoProductos, type Tanda } from "@/hooks/use-catalogo-productos";

// Columnas de la home: 2 (<640) · 3 (≥640) · 4 (≥768) · 5 (≥1024) · 6 (≥1280).
export const CATALOG_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/** Esqueleto con la forma de HomeProductCard (pozo cuadrado + precio + nombre). */
export function CatalogSkeleton({ cantidad = 12 }: { cantidad?: number }) {
  return (
    <div className={CATALOG_GRID} aria-busy="true" aria-label="Cargando productos">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="p-1.5" aria-hidden>
          <div className="aspect-square rounded-xl skeleton-shimmer" />
          <div className="mt-2.5 space-y-2 px-1">
            <div className="h-5 w-1/3 rounded-md skeleton-shimmer" />
            <div className="h-3.5 w-11/12 rounded-md skeleton-shimmer" />
            <div className="h-3.5 w-2/3 rounded-md skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CatalogView({
  searchQuery,
  zone,
  tanda,
  tandaSiguiente = 36,
  cargaManual = false,
}: {
  searchQuery?: string;
  zone?: string;
  /** Categoría de tienda (legado: no se usa). */
  category?: string;
  /** Productos de la 1.ª página (default 40). */
  tanda?: Tanda;
  /** Productos de cada «Ver más» (default 36). */
  tandaSiguiente?: Tanda;
  /** «Ver más» en vez de scroll infinito. */
  cargaManual?: boolean;
}) {
  const catalogo = useCatalogoProductos({ searchQuery, zone, tanda, tandaSiguiente, cargaManual });
  const { products, displayProducts, availableCount, loading, loadingMore, error, hasMore } = catalogo;
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="space-y-4">
      {/* Cuántos hay: solo con un filtro puesto (sin filtro, la cabecera ya lo dice). */}
      {!loading && catalogo.filtroActivo && (
        <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
          <strong className="tabular-nums text-[var(--text-primary)]">{availableCount}</strong>{" "}
          {availableCount === 1 ? "producto disponible" : "productos disponibles"}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-4"
        >
          <span className="flex-1 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</span>
          <button
            type="button"
            onClick={catalogo.reintentar}
            className="h-11 rounded-xl px-3 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)]"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading && <CatalogSkeleton cantidad={typeof tanda === "number" ? Math.min(tanda, 12) : 12} />}

      {!loading && products.length > 0 && (
        <ul className={CATALOG_GRID} aria-label="Productos del mercado">
          {displayProducts.map((product, i) => (
            <li key={product.storeProductId} className="relative min-w-0">
              {product.isSponsored && (
                <div className="pointer-events-none absolute right-3 top-3 z-20">
                  <SponsoredBadge />
                </div>
              )}
              <HomeProductCard product={toCatalogCardProduct(product)} index={i} href={hrefDeProducto(product)} />
            </li>
          ))}
        </ul>
      )}

      {!loading && products.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--surface-sunken)]">
            <Package className="h-9 w-9 text-[var(--text-tertiary)]" aria-hidden />
          </div>
          <p className="text-base font-bold text-[var(--text-primary)]">No encontramos productos</p>
          <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
            Prueba con otro filtro o busca algo diferente.
          </p>
        </div>
      )}

      {/* «Ver más» (carga manual) o centinela del scroll infinito. */}
      {cargaManual ? (
        !loading &&
        hasMore && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={catalogo.cargarMas}
              disabled={loadingMore}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 text-base font-bold text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-70"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {loadingMore ? "Cargando…" : "Ver más productos"}
            </button>
          </div>
        )
      ) : (
        <div ref={catalogo.loaderRef} className="py-4">
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" aria-hidden />
              <span className="text-sm font-medium text-[var(--text-secondary)]">Cargando más productos…</span>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-xl shadow-primary/30 transition-all hover:scale-110 hover:bg-primary/90 active:scale-95"
            aria-label="Volver arriba"
          >
            <ArrowUp className="h-5 w-5" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
