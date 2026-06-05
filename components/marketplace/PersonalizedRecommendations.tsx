"use client";

/**
 * PersonalizedRecommendations — sección "Para ti" del marketplace.
 *
 * Recomendaciones IA basadas en el historial de compras del cliente
 * (co-ocurrencia de productos). Carrusel horizontal.
 *
 * Fuente de datos: `/api/marketplace/recommendations/for-me` (SESIÓN del
 * customer vía cookie — NO el endpoint `personalized` que exige header
 * x-tenant-id y rompía en el marketplace cross-tenant con 400). Devuelve:
 *   200 { products: [{ productId, name, price, image, score }] }  con historial
 *   204 (sin contenido)  → cliente anónimo / sin historial → la sección se oculta
 *
 * Como el feed es cross-store y el payload no trae storeSlug, cada card
 * enlaza a la BÚSQUEDA del producto (`/marketplace/buscar?q=`) — siempre
 * válido y deja al cliente elegir tienda/precio. Sin add-to-cart directo
 * (evita carrito sin storeId).
 */

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, ChevronLeft, ChevronRight, ShoppingBag } from "@buleje/design-system/icons";

interface RecProduct {
  productId: number;
  name: string;
  price: number;
  image: string | null;
  score: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function SkeletonCard() {
  return (
    <div className="w-40 shrink-0 overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <div className="aspect-square animate-pulse bg-[var(--surface-sunken)]" />
      <div className="space-y-1.5 p-2.5">
        <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--surface-sunken)]" />
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}

export default function PersonalizedRecommendations() {
  const [products, setProducts] = useState<RecProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/recommendations/for-me?limit=12", { credentials: "include" })
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((json: { products?: RecProduct[] } | null) => {
        if (cancelled) return;
        setProducts(Array.isArray(json?.products) ? json!.products : []);
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
  }, []);

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

  // Sin historial / cliente anónimo (204) → no renderizar nada.
  if (!loading && products.length === 0) return null;

  return (
    <section aria-label="Recomendados para ti" className="py-1">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-base font-extrabold leading-tight text-[var(--text-primary)]">
              Para ti
            </h2>
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              Según lo que compraste antes
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            aria-label="Anterior"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            aria-label="Siguiente"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : products.map((p) => (
                <Link
                  key={p.productId}
                  href={`/marketplace/buscar?q=${encodeURIComponent(p.name)}`}
                  style={{ scrollSnapAlign: "start" }}
                  className="group w-40 shrink-0 overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/60 hover:shadow-[var(--shadow-md)]"
                >
                  <div className="relative aspect-square overflow-hidden bg-white dark:bg-gray-900">
                    {p.image ? (
                      <Image
                        src={p.image}
                        alt={p.name}
                        fill
                        sizes="160px"
                        className="object-contain p-2 transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                        <ShoppingBag className="h-8 w-8" strokeWidth={1.5} aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                      {p.name}
                    </p>
                    <p className="mt-1 text-base font-black tabular-nums text-[var(--text-primary)]">
                      {fmt(p.price)}
                    </p>
                  </div>
                </Link>
              ))}
        </div>
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-[var(--surface-canvas)] to-transparent" />
        )}
      </div>
    </section>
  );
}
