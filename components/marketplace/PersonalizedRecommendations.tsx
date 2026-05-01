"use client";

/**
 * PersonalizedRecommendations
 * Sección "Para ti" en el storefront. Carousel horizontal de productos.
 * Lee el phone del contexto customer. Si no hay customer → cold start.
 */

import { useState, useEffect, useRef } from "react";
import { Sparkles, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface RecommendedProduct {
  productId: string;
  productName: string;
  productImage: string | null;
  price: number;
  score: number;
  reason: string;
  storeSlug?: string;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="w-40 shrink-0 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden animate-pulse">
      <div className="aspect-[1/1] bg-gray-100 dark:bg-gray-800" />
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
        <div className="h-3.5 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-full" />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PersonalizedRecommendations() {
  const { customer } = useCustomer();
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        if (!customer?.phone) {
          // Sin customer: no hay recomendaciones personalizadas
          if (!cancelled) setProducts([]);
          return;
        }
        const res = await fetch(
          `/api/marketplace/recommendations/personalized?customerPhone=${encodeURIComponent(customer.phone)}&limit=20`
        );
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json() as { data: RecommendedProduct[] };
        if (!cancelled) setProducts(json.data ?? []);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [customer?.phone]);

  // Scroll arrows logic
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollState);
  }, [products]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "right" ? 320 : -320, behavior: "smooth" });
  };

  // Cold start o sin historial: no rendereamos nada — la personalizacion
  // se aplica directo en el catalogo principal (sort by popularity + history).
  // Decision 2026-04-20: eliminado el placeholder "estamos aprendiendo tus gustos"
  // que generaba ruido visual sin agregar valor al user.
  if (!loading && (!customer?.phone || products.length === 0)) {
    return null;
  }

  return (
    <section className="py-6 px-4 sm:px-0">
      {/* Heading */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Para ti</h2>
        </div>
        {/* Flechas desktop */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            aria-label="Anterior"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            aria-label="Siguiente"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Carousel */}
      <div className="relative -mx-4 sm:mx-0">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-0 pb-2"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : products.map((p, i) => (
                <div key={p.productId} className="w-40 shrink-0">
                  <UnifiedProductCard
                    index={i}
                    product={{
                      id: parseInt(p.productId, 10) || i,
                      name: p.productName,
                      price: p.price,
                      image: p.productImage,
                      storeSlug: p.storeSlug,
                      description: p.reason || undefined,
                    }}
                    href={p.storeSlug ? `/marketplace/${p.storeSlug}` : "/marketplace"}
                  />
                </div>
              ))
          }
        </div>

        {/* Gradiente derecho */}
        {canScrollRight && (
          <div className="absolute top-0 right-0 h-full w-16 bg-linear-to-l from-white dark:from-gray-950 to-transparent pointer-events-none" />
        )}
      </div>
    </section>
  );
}
