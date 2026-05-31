"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import ExplorarSectionHeader from "./ExplorarSectionHeader";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface NormalizedProduct {
  productId: number;
  storeSlug?: string;
  name: string;
  image: string | null;
  price: number;
}

// Shape del endpoint /api/marketplace/recommendations/for-me
interface ForMeProduct {
  id?: number;
  productId?: number;
  name: string;
  image: string | null;
  price: number;
}

// Shape del endpoint /api/marketplace/top-today
interface TopProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  store: { slug: string; name: string; rating: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function normalizeForMe(p: ForMeProduct): NormalizedProduct {
  return {
    productId: p.productId ?? p.id ?? 0,
    name: p.name,
    image: p.image,
    price: Number(p.price) || 0,
  };
}

function normalizeTopToday(p: TopProduct): NormalizedProduct {
  return {
    productId: Number(p.productId),
    storeSlug: p.store?.slug,
    name: p.name,
    image: p.image,
    price: Number(p.price) || 0,
  };
}

function SkeletonCard() {
  return (
    <div className="border border-[var(--rule-soft)] rounded-xl overflow-hidden bg-[var(--surface-raised)]">
      <div className="aspect-square skeleton-shimmer" />
      <div className="p-3 space-y-2">
        <div className="h-4 rounded-md skeleton-shimmer" />
        <div className="h-4 w-2/3 rounded-md skeleton-shimmer" />
      </div>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function NeighborsBoughtStrip() {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Intentar recomendaciones personalizadas
        const forMeRes = await fetch("/api/marketplace/recommendations/for-me?limit=12");
        if (forMeRes.ok) {
          const data = (await forMeRes.json()) as { products: ForMeProduct[] };
          if (!cancelled && Array.isArray(data.products) && data.products.length > 0) {
            setProducts(data.products.map(normalizeForMe));
            return;
          }
        }

        // 2) Fallback: top-today (sin auth requerida)
        const topRes = await fetch("/api/marketplace/top-today?limit=12");
        if (topRes.ok) {
          const data = (await topRes.json()) as { items: TopProduct[] };
          if (!cancelled && Array.isArray(data.items) && data.items.length > 0) {
            setProducts(data.items.map(normalizeTopToday));
            return;
          }
        }

        if (!cancelled) setProducts([]);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <ExplorarSectionHeader
        kicker="Tendencias"
        title="Tus vecinos compran"
        subtitle="Lo que mas se pide en Ciudad Constitución esta semana"
        ctaLabel="Ver top hoy"
        ctaHref="/marketplace/explorar?ranking=top"
      />

      <HorizontalCarousel ariaLabel="Tus vecinos compran">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : products.map((product, index) => (
              <Link
                key={`${product.storeSlug ?? "g"}-${product.productId}`}
                href={
                  product.storeSlug
                    ? `/marketplace/${product.storeSlug}/producto/${product.productId}`
                    : `/marketplace/explorar?q=${encodeURIComponent(product.name)}`
                }
                className="group/card block relative overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all duration-300 hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0"
              >
                {/* Badge de ranking top 3 */}
                {index < 3 && (
                  <span className="absolute top-2.5 left-2.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-black tabular-nums shadow-sm">
                    {index + 1}
                  </span>
                )}

                <div className="relative aspect-square bg-[var(--surface-canvas)] overflow-hidden">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="240px"
                      className="object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Package className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
                    </span>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                    {product.name}
                  </p>
                  <p className="text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
                    {pen.format(product.price)}
                  </p>
                </div>
              </Link>
            ))}
      </HorizontalCarousel>
    </section>
  );
}
