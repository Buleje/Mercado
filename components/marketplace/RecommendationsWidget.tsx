"use client";

/**
 * components/marketplace/RecommendationsWidget.tsx
 *
 * Muestra los productos que otros clientes compraron junto con el producto actual.
 * Mobile-first: grid 2 columnas en móvil, 5 en desktop.
 * No se renderiza si no hay recomendaciones (return null).
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

// ── Tipos ────────────────────────────────────────────────────────────────────

type RelatedProduct = {
  productId: number;
  name: string;
  price: number;
  image: string | null;
  score: number;
};

type Props = {
  productId: number;
  /** Ruta base del marketplace para generar links de producto */
  storeSlug?: string;
  title?: string;
};

// ── Skeleton de carga ────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="animate-pulse rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
      aria-hidden="true"
    >
      <div className="aspect-square bg-gray-200 dark:bg-gray-700" />
      <div className="p-2 space-y-1.5">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  );
}

// ── Tarjeta de producto ───────────────────────────────────────────────────────

function ProductCard({
  product,
  storeSlug,
}: {
  product: RelatedProduct;
  storeSlug?: string;
}) {
  const href = storeSlug
    ? `/marketplace/${storeSlug}/producto/${product.productId}`
    : `/marketplace/producto/${product.productId}`;

  return (
    <Link
      href={href}
      className="group rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-[#00B4A6] dark:hover:border-[#00B4A6] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B4A6]"
    >
      <div className="relative aspect-square overflow-hidden bg-gray-50 dark:bg-gray-800">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl text-gray-300 dark:text-gray-600" aria-hidden="true">
              &#128722;
            </span>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight">
          {product.name}
        </p>
        <p className="mt-1 text-sm font-bold text-[#00B4A6]">
          S/ {product.price.toFixed(2)}
        </p>
      </div>
    </Link>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────

export function RecommendationsWidget({
  productId,
  storeSlug,
  title = "También te puede gustar",
}: Props) {
  const [products, setProducts] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/marketplace/recommendations/${productId}`)
      .then((r) => {
        if (!r.ok) return { products: [] };
        return r.json() as Promise<{ products: RelatedProduct[] }>;
      })
      .then((data) => {
        if (!cancelled) setProducts(data.products ?? []);
      })
      .catch(() => {
        // Silencioso — el widget simplemente no se muestra
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Loading: mostrar 5 skeletons
  if (loading) {
    return (
      <section aria-label="Cargando recomendaciones" className="mt-8">
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    );
  }

  // Empty state — no renderizar nada
  if (products.length === 0) return null;

  return (
    <section aria-label={title} className="mt-8">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
        {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {products.map((p) => (
          <ProductCard key={p.productId} product={p} storeSlug={storeSlug} />
        ))}
      </div>
    </section>
  );
}
