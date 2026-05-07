"use client";

/**
 * components/marketplace/TrendingTodayWidget.tsx
 *
 * Widget "Trending hoy" — top productos por unidades vendidas en 24h.
 * Mobile-first: scroll horizontal snap-x en mobile, grid 4-6 cols en desktop.
 * Framer Motion stagger 50ms en entrada. AbortController para cleanup.
 * A11y: <section aria-label>, cards con role="link" + kbd nav.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, RotateCcw, ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface TrendingProduct {
  storeProductId: string | number;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  soldUnits: number;
  trendPct: number | null;
  store: {
    slug: string;
    name: string;
    rating: number;
  };
}

interface ApiResponse {
  items: Record<string, unknown>[];
  window: "24h" | "7d";
  updatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(raw: Record<string, unknown>): TrendingProduct {
  const store = (raw.store as Record<string, unknown>) ?? {};
  return {
    storeProductId: String(raw.storeProductId ?? raw.id ?? ""),
    productId: Number(raw.productId),
    name: String(raw.name ?? ""),
    price: Number(raw.price ?? 0),
    image: typeof raw.image === "string" ? raw.image : null,
    unit: typeof raw.unit === "string" ? raw.unit : null,
    soldUnits: Number(raw.soldUnits ?? 0),
    trendPct: raw.trendPct != null ? Number(raw.trendPct) : null,
    store: {
      slug: String(store.slug ?? ""),
      name: String(store.name ?? ""),
      rating: Number(store.rating ?? 0),
    },
  };
}

function productHref(p: TrendingProduct): string {
  if (p.store.slug) {
    return `/marketplace/${p.store.slug}?p=${p.productId}`;
  }
  return `/marketplace/producto/${p.productId}`;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    // Altura fija idéntica a la card real → sin CLS
    <div
      aria-hidden="true"
      className="flex-none w-[140px] sm:w-auto rounded-2xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-raised)] animate-pulse"
      style={{ height: "208px" }}
    >
      {/* Thumb 80×80 */}
      <div className="flex items-center justify-center bg-[var(--surface-sunken)] h-[88px]">
        <div className="h-20 w-20 rounded-xl bg-[var(--rule-base)]" />
      </div>
      {/* Texto */}
      <div className="p-3 space-y-2">
        <div className="h-3 bg-[var(--rule-base)] rounded w-4/5" />
        <div className="h-3 bg-[var(--rule-base)] rounded w-3/5" />
        <div className="h-5 bg-[var(--rule-base)] rounded w-2/5 mt-1" />
      </div>
    </div>
  );
}

// ── Badge de tendencia ────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number }) {
  const isUp = pct >= 0;
  return (
    <span
      className={[
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm font-semibold leading-none",
        isUp
          ? "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-emerald-900/40 dark:text-emerald-400"
          : "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-red-900/40 dark:text-red-400",
      ].join(" ")}
    >
      {isUp ? (
        <TrendingUp className="h-3 w-3" aria-hidden />
      ) : (
        <TrendingDown className="h-3 w-3" aria-hidden />
      )}
      {isUp ? "+" : ""}
      {pct}% vs ayer
    </span>
  );
}

// ── Card de producto trending ─────────────────────────────────────────────────

interface TrendingCardProps {
  product: TrendingProduct;
  rank: number;
  motionIndex: number;
}

function TrendingCard({ product, rank, motionIndex }: TrendingCardProps) {
  const href = productHref(product);

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: motionIndex * 0.05, ease: "easeOut" }}
    >
      <Link
        href={href}
        role="link"
        aria-label={`${product.name} — ${formatCurrency(product.price)} — tienda ${product.store.name}`}
        className={[
          "group flex flex-col rounded-2xl overflow-hidden border border-[var(--rule-soft)]",
          "bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:shadow-lg",
          "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
          "w-[140px] sm:w-auto", // snap width mobile, auto en grid
        ].join(" ")}
        // Altura fija igual a los skeletons → sin CLS
        style={{ height: "208px" }}
      >
        {/* Imagen 80×80 sobre fondo sunken */}
        <div className="relative flex items-center justify-center bg-[var(--surface-sunken)] h-[88px] overflow-hidden">
          {/* Badge rank top-left */}
          <span
            aria-hidden
            className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white text-xs font-bold leading-none"
          >
            {rank}
          </span>

          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              width={80}
              height={80}
              sizes="80px"
              className="h-20 w-20 object-contain rounded-xl transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-xl bg-[var(--rule-base)]"
            >
              <ShoppingBag
                className="h-8 w-8 text-[var(--text-tertiary)]"
                aria-hidden
              />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 p-3 flex-1 overflow-hidden">
          {/* Nombre — 2 líneas máx */}
          <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 min-h-[2.5rem]">
            {product.name}
          </p>

          {/* Precio */}
          <p className="text-sm font-bold text-[var(--accent)]">
            {formatCurrency(product.price)}
            {product.unit ? (
              <span className="ml-1 text-xs font-normal text-[var(--text-tertiary)]">
                /{product.unit}
              </span>
            ) : null}
          </p>

          {/* Badge tendencia — si viene del backend */}
          {product.trendPct != null && (
            <TrendBadge pct={product.trendPct} />
          )}
        </div>
      </Link>
    </m.div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ShoppingBag
        className="h-10 w-10 text-[var(--text-tertiary)]"
        aria-hidden
      />
      <p className="text-sm text-[var(--text-secondary)]">
        Aún no hay tendencias del día
      </p>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        No pudimos cargar las tendencias
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--rule-soft)] transition-colors min-h-[44px]"
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
        Reintentar
      </button>
    </div>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────

type FetchState = "loading" | "success" | "empty" | "error";

export default function TrendingTodayWidget() {
  const [items, setItems] = useState<TrendingProduct[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [windowLabel, setWindowLabel] = useState<"24h" | "7d">("24h");
  const retryRef = useRef(0);

  const load = () => {
    setFetchState("loading");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    fetch("/api/marketplace/top-today?limit=10", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((data) => {
        clearTimeout(timeoutId);
        if (Array.isArray(data?.items) && data.items.length > 0) {
          setItems(data.items.map(normalize));
          setWindowLabel(data.window === "7d" ? "7d" : "24h");
          setFetchState("success");
        } else {
          setFetchState("empty");
        }
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") return;
        setFetchState("error");
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  };

  useEffect(() => {
    const cleanup = load();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryRef.current]);

  const handleRetry = () => {
    retryRef.current += 1;
    load();
  };

  const subtitleText =
    windowLabel === "7d"
      ? "Los más comprados en los últimos 7 días"
      : "Lo más comprado en las últimas 24h";

  return (
    <section aria-label="Productos trending hoy" aria-live="polite">
      {/* Encabezado */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-black text-[var(--text-primary)] leading-tight">
            Trending hoy
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {subtitleText}
          </p>
        </div>
        {fetchState === "success" && items.length > 0 && (
          <Link
            href="/marketplace?vista=catalogo&sort=popular"
            className="shrink-0 text-sm font-semibold text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-sm whitespace-nowrap"
          >
            Ver todo
          </Link>
        )}
      </div>

      {/* Cuerpo */}
      <AnimatePresence mode="wait">
        {fetchState === "loading" && (
          /* ── Skeleton ── */
          <div
            key="skeleton"
            role="status"
            aria-label="Cargando trending"
            className={[
              // Mobile: scroll horizontal
              "flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth",
              // Desktop: grid
              "sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-6",
            ].join(" ")}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="snap-start flex-none sm:flex-initial"
              >
                <SkeletonCard />
              </div>
            ))}
          </div>
        )}

        {fetchState === "empty" && (
          <m.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <EmptyState />
          </m.div>
        )}

        {fetchState === "error" && (
          <m.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ErrorState onRetry={handleRetry} />
          </m.div>
        )}

        {fetchState === "success" && items.length > 0 && (
          /* ── Cards con stagger ── */
          <div
            key="cards"
            className={[
              // Mobile: scroll horizontal snap
              "flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-1",
              // Desktop: grid 4 → 6 cols
              "sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 lg:grid-cols-6",
            ].join(" ")}
          >
            {items.map((product, idx) => (
              <div
                key={String(product.storeProductId)}
                className="snap-start flex-none sm:flex-initial"
              >
                <TrendingCard
                  product={product}
                  rank={idx + 1}
                  motionIndex={idx}
                />
              </div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
