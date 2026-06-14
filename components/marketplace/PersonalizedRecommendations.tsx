"use client";

/**
 * PersonalizedRecommendations — sección "Para ti" del marketplace.
 *
 * Recomendaciones IA basadas en el historial de compras del cliente
 * (co-ocurrencia de productos). Carrusel horizontal.
 *
 * Fuente de datos (2 caminos):
 *
 * 1. LOGUEADO — `/api/marketplace/recommendations/for-me` (SESIÓN del customer
 *    vía cookie). Devuelve 200 { products:[{productId,name,price,image,score}] }
 *    con historial, o 401 cuando es anónimo.
 *
 * 2. ANÓNIMO (401 en for-me) — `/api/marketplace/recommendations/personalized`
 *    con SEÑALES DE SESIÓN del browser (localStorage): productos vistos
 *    (use-recently-viewed) + categorías clickeadas (buleje:categoria-clicks).
 *    El middleware inyecta x-tenant-id (por eso credentials:"include").
 *    Devuelve { data:[DbRecommendedProduct], total }. Si NO hay señales
 *    (primera visita absoluta) la sección se oculta (Bestsellers ya cubre).
 *
 * Como el feed es cross-store, cada card enlaza a la BÚSQUEDA del producto
 * (`/marketplace/buscar?q=`) — siempre válido y deja al cliente elegir
 * tienda/precio. Sin add-to-cart directo (evita carrito sin storeId).
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
  reason?: string;
}

// ── Señales de sesión para visitantes anónimos (localStorage) ──────────────
const RECENTLY_VIEWED_KEY = "buleje-recently-viewed-v1";
const CATEGORY_CLICKS_KEY = "buleje:categoria-clicks";

/** Lee IDs de productos vistos (numéricos) del tracker de recently-viewed. */
function readViewedProductIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: number | string }>;
    const ids = parsed
      .map((i) => Number(i.id))
      .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n > 0);
    return [...new Set(ids)].slice(0, 50);
  } catch {
    return [];
  }
}

/** Lee categorías clickeadas, ordenadas por frecuencia (más clickeada primero). */
function readViewedCategories(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CATEGORY_CLICKS_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, number>;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    return [];
  }
}

/** Forma cruda del endpoint `personalized` ({ data:[DbRecommendedProduct] }). */
interface SignalRecProduct {
  productId: number;
  productName: string;
  retailPrice: number;
  image: string | null;
  score: number;
  reason: string;
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
  // "purchases" = logueado (historial) · "signals" = anónimo (sesión) · null = sin datos
  const [source, setSource] = useState<"purchases" | "signals" | null>(null);
  const [topCategory, setTopCategory] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Fallback anónimo: lee señales de sesión y consulta `personalized`.
    const loadFromSignals = async () => {
      const viewedProductIds = readViewedProductIds();
      const viewedCategories = readViewedCategories();
      // Primera visita absoluta (sin ninguna señal) → ocultar (Bestsellers cubre).
      if (viewedProductIds.length === 0 && viewedCategories.length === 0) {
        if (!cancelled) setProducts([]);
        return;
      }
      const qs = new URLSearchParams({ limit: "12" });
      if (viewedProductIds.length > 0) qs.set("viewedProductIds", viewedProductIds.join(","));
      if (viewedCategories.length > 0) qs.set("viewedCategories", viewedCategories.join(","));
      try {
        const res = await fetch(
          `/api/marketplace/recommendations/personalized?${qs.toString()}`,
          { credentials: "include" }, // middleware inyecta x-tenant-id
        );
        if (!res.ok) {
          if (!cancelled) setProducts([]);
          return;
        }
        const json = (await res.json()) as { data?: SignalRecProduct[] } | null;
        const mapped: RecProduct[] = Array.isArray(json?.data)
          ? json!.data.map((d) => ({
              productId: d.productId,
              name: d.productName,
              price: d.retailPrice,
              image: d.image,
              score: d.score,
              reason: d.reason,
            }))
          : [];
        if (cancelled) return;
        setProducts(mapped);
        if (mapped.length > 0) {
          setSource("signals");
          setTopCategory(viewedCategories[0] ?? null);
        }
      } catch {
        if (!cancelled) setProducts([]);
      }
    };

    (async () => {
      try {
        const r = await fetch("/api/marketplace/recommendations/for-me?limit=12", {
          credentials: "include",
        });
        if (r.status === 200) {
          const json = (await r.json()) as { products?: RecProduct[] } | null;
          if (cancelled) return;
          const list = Array.isArray(json?.products) ? json!.products : [];
          setProducts(list);
          if (list.length > 0) setSource("purchases");
          // Logueado pero sin recomendaciones por historial → probar señales.
          if (list.length === 0) await loadFromSignals();
        } else {
          // Anónimo (401) o sin contenido → señales de sesión.
          await loadFromSignals();
        }
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

  // Sin historial NI señales de sesión → no renderizar nada (Bestsellers cubre).
  if (!loading && products.length === 0) return null;

  // Título adaptable: logueado vs anónimo (con categoría dominante o genérico).
  const heading =
    source === "signals" && topCategory ? `Porque viste ${topCategory}` : "Para ti";
  const subheading =
    source === "purchases"
      ? "Según lo que compraste antes"
      : source === "signals"
        ? "Elegido para ti según lo que estuviste viendo"
        : "Elegido para ti";

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
              {heading}
            </h2>
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {subheading}
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
                    {p.reason && p.reason !== "Recomendado para ti" && (
                      <span className="absolute left-1.5 top-1.5 z-10 max-w-[85%] truncate rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[0.7rem] font-bold text-[var(--accent)] shadow-[var(--shadow-sm)]">
                        {p.reason}
                      </span>
                    )}
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
