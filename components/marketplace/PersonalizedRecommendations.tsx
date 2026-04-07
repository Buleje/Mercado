"use client";

/**
 * PersonalizedRecommendations
 * Sección "Para vos" en el storefront. Carousel horizontal de productos.
 * Lee el phone del contexto customer. Si no hay customer → cold start.
 */

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";

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

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="w-40 shrink-0 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-100 dark:bg-gray-800" />
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
        <div className="h-3.5 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-full" />
      </div>
    </div>
  );
}

// ── ProductCard ───────────────────────────────────────────────────────────────

function ProductCard({
  product,
  index,
}: {
  product: RecommendedProduct;
  index: number;
}) {
  const [imgError, setImgError] = useState(false);
  const href = product.storeSlug
    ? `/marketplace/${product.storeSlug}`
    : `/marketplace`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.06, 0.5) }}
      className="w-40 shrink-0"
    >
      <Link
        href={href}
        className="group block rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5 transition-all duration-250"
      >
        {/* Imagen */}
        <div className="relative aspect-square bg-gray-50 dark:bg-gray-800 overflow-hidden">
          {product.productImage && !imgError ? (
            <Image
              src={product.productImage}
              alt={product.productName}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="160px"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600">
              <Package className="h-8 w-8" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2.5">
          <p className="text-sm font-bold text-primary leading-none">
            {fmt(product.price)}
          </p>
          <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2 mt-1 min-h-8">
            {product.productName}
          </p>
          {product.reason && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 line-clamp-2 leading-tight">
              {product.reason}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
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

  // Cold start: no hay customer
  if (!loading && !customer?.phone) {
    return (
      <section className="py-6 px-4 sm:px-0">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Para vos</h2>
        </div>
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 py-8 px-4 text-center">
          <Sparkles className="h-8 w-8 text-primary/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Estamos aprendiendo tus gustos.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
            Compra mas para recibir recomendaciones personalizadas para ti.
          </p>
        </div>
      </section>
    );
  }

  // Empty: customer existe pero sin historial suficiente
  if (!loading && products.length === 0 && customer?.phone) {
    return (
      <section className="py-6 px-4 sm:px-0">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Para vos</h2>
        </div>
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 py-8 px-4 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Aun no tenemos recomendaciones para ti. Sigue comprando.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 px-4 sm:px-0">
      {/* Heading */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Para vos</h2>
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
            : products.map((p, i) => <ProductCard key={p.productId} product={p} index={i} />)
          }
        </div>

        {/* Gradiente derecho */}
        {canScrollRight && (
          <div className="absolute top-0 right-0 h-full w-16 bg-gradient-to-l from-white dark:from-gray-950 to-transparent pointer-events-none" />
        )}
      </div>
    </section>
  );
}
