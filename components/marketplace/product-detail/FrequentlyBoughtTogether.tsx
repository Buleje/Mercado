"use client";

/**
 * FrequentlyBoughtTogether — Sección "Frecuentemente comprados juntos" del PDP.
 *
 * Llama a GET /api/marketplace/recommendations/[productId] (endpoint ya existente)
 * que devuelve { products: RelatedProduct[] } con los productos co-comprados.
 *
 * Auto-oculta si la respuesta está vacía o falla.
 * Mobile-first: scroll horizontal en mobile, grid en desktop.
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, ShoppingCart, Zap } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

// ── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * Forma que devuelve el endpoint /api/marketplace/recommendations/[productId].
 * El campo `category` y `stock` son opcionales porque la API base no los incluye
 * siempre — se completan desde el producto de referencia cuando aplica.
 */
type RecommendedProduct = {
  productId: number;
  name: string;
  price: number;
  image: string | null;
  score: number;
  storeSlug?: string;
  storeName?: string;
  storeId?: string;
  storeProductId?: string;
  unit?: string | null;
  stock?: number | null;
  category?: string | null;
};

interface FrequentlyBoughtTogetherProps {
  /** ID del producto actual — se pasa al endpoint de recommendations */
  productId: number;
  /** Store del producto actual — se usa como fallback si el producto recomendado no tiene storeSlug */
  storeId: string;
  storeName: string;
  storeSlug: string;
}

// ── Formateador ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

// ── Card individual ───────────────────────────────────────────────────────────

function ProductChip({
  product,
  fallbackStoreId,
  fallbackStoreName,
  fallbackStoreSlug,
}: {
  product: RecommendedProduct;
  fallbackStoreId: string;
  fallbackStoreName: string;
  fallbackStoreSlug: string;
}) {
  const { addItem } = useMarketplaceCart();
  const [added, setAdded] = useState(false);

  const effectiveStoreId = product.storeId ?? fallbackStoreId;
  const effectiveStoreName = product.storeName ?? fallbackStoreName;
  const effectiveStoreSlug = product.storeSlug ?? fallbackStoreSlug;
  const effectiveStoreProductId = product.storeProductId ?? String(product.productId);

  const handleAdd = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (added) return;

      addItem({
        storeId: effectiveStoreId,
        storeName: effectiveStoreName,
        storeSlug: effectiveStoreSlug,
        storeProductId: effectiveStoreProductId,
        productId: product.productId,
        name: product.name,
        price: product.price,
        basePrice: product.price,
        image: product.image ?? null,
        unit: product.unit ?? null,
        category: product.category ?? null,
        quantity: 1,
      });

      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    },
    [
      added,
      addItem,
      effectiveStoreId,
      effectiveStoreName,
      effectiveStoreSlug,
      effectiveStoreProductId,
      product,
    ],
  );

  const href = `/marketplace/${effectiveStoreSlug}/producto/${product.productId}`;
  const isOutOfStock = product.stock !== undefined && product.stock !== null && product.stock === 0;

  return (
    <Link
      href={href}
      className="group relative flex-shrink-0 w-36 sm:w-40 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden hover:border-[var(--accent)]/40 hover:shadow-md transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:outline-none"
      aria-label={`Ver ${product.name} — ${fmt(product.price)}`}
    >
      {/* Imagen */}
      <div className="relative aspect-square w-full overflow-hidden bg-[var(--surface-sunken)]">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 144px, 160px"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
            <ShoppingCart className="h-8 w-8 opacity-30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 pt-2 pb-3 space-y-1">
        <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-tight min-h-[2.25rem]">
          {product.name}
        </p>
        <p className="text-sm font-extrabold text-[var(--accent)] tabular-nums">
          {fmt(product.price)}
        </p>
        {product.unit && (
          <p className="text-[10px] text-[var(--text-tertiary)]">/ {product.unit}</p>
        )}
      </div>

      {/* Botón agregar */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={handleAdd}
          disabled={isOutOfStock}
          aria-label={
            isOutOfStock
              ? "Agotado"
              : added
              ? "Agregado al carrito"
              : `Agregar ${product.name} al carrito`
          }
          className={cn(
            "w-full h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95",
            isOutOfStock
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
              : added
              ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
              : "bg-[var(--accent)] text-white hover:opacity-90 shadow-sm",
          )}
        >
          {isOutOfStock ? (
            "Agotado"
          ) : added ? (
            <>
              <ShoppingCart className="h-3.5 w-3.5" />
              Agregado
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Agregar
            </>
          )}
        </button>
      </div>
    </Link>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChipSkeleton() {
  return (
    <div
      className="flex-shrink-0 w-36 sm:w-40 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="aspect-square w-full bg-[var(--rule-soft)]" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-3/4 rounded bg-[var(--rule-soft)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--rule-soft)]" />
        <div className="h-8 rounded-xl bg-[var(--rule-soft)]" />
      </div>
    </div>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────

export default function FrequentlyBoughtTogether({
  productId,
  storeId,
  storeName,
  storeSlug,
}: FrequentlyBoughtTogetherProps) {
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/marketplace/recommendations/${productId}`)
      .then((r) => {
        if (!r.ok) return { products: [] };
        return r.json() as Promise<{ products: RecommendedProduct[] }>;
      })
      .then((data) => {
        if (!cancelled) setProducts(data.products ?? []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Cargando: mostrar 4 skeletons
  if (loading) {
    return (
      <section aria-label="Cargando productos frecuentes">
        <div className="h-6 w-56 rounded bg-[var(--rule-soft)] animate-pulse mb-5" />
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ChipSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  // Sin datos — auto-ocultar
  if (products.length === 0) return null;

  return (
    <section aria-labelledby="fbt-heading">
      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)]/10">
          <Zap className="h-4 w-4 text-[var(--accent)]" />
        </div>
        <h2
          id="fbt-heading"
          className="text-lg sm:text-xl font-bold text-[var(--text-primary)]"
        >
          Frecuentemente comprados juntos
        </h2>
      </div>

      {/* Franja horizontal: scroll en mobile, wrapped en desktop */}
      <div
        className="flex gap-3 overflow-x-auto pb-3 sm:pb-0 sm:flex-wrap sm:overflow-visible"
        role="list"
        aria-label="Productos frecuentemente comprados junto a este"
      >
        {products.map((p) => (
          <div key={p.productId} role="listitem">
            <ProductChip
              product={p}
              fallbackStoreId={storeId}
              fallbackStoreName={storeName}
              fallbackStoreSlug={storeSlug}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
