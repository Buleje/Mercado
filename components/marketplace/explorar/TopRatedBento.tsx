"use client";

/**
 * TopRatedBento — bento grid 1+3 con productos top-rated.
 * Primer card ocupa 2 filas (hero). Los 3 restantes apilados a la derecha.
 *
 * Patron Buleje: 0 emojis, 0 colores hardcoded, iconos del DS.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Package } from "@buleje/design-system/icons";
import ExplorarSectionHeader from "./ExplorarSectionHeader";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CatalogItem {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  storeSlug: string;
  avgRating?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pen = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < Math.round(rating)
              ? "text-[var(--accent)] fill-[var(--accent)]"
              : "text-[var(--rule-base)] fill-transparent"
          }`}
          aria-hidden
        />
      ))}
      <span className="text-xs font-bold text-[var(--text-primary)] ml-1 tabular-nums">
        {rating > 0 ? rating.toFixed(1) : "Nueva"}
      </span>
    </div>
  );
}

// Skeleton placeholder uniforme
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="aspect-square skeleton-shimmer" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 skeleton-shimmer rounded" />
        <div className="h-6 w-1/2 skeleton-shimmer rounded" />
      </div>
    </div>
  );
}

// Card uniforme — todas iguales con ranking badge
function UniformCard({ item, rank }: { item: CatalogItem; rank: number }) {
  return (
    <Link
      href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
      className="group/card relative block overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all duration-300 hover:border-[var(--accent)]/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0"
    >
      {/* Badge de ranking — mismo tamaño en todas */}
      <span
        className={`absolute top-2.5 left-2.5 z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[length:var(--ts-xs)] font-black shadow-sm ${
          rank === 1
            ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
            : "bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]"
        }`}
      >
        {rank === 1 ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            Top
          </span>
        ) : (
          `#${rank}`
        )}
      </span>

      {/* Imagen aspect-square uniforme */}
      <div className="relative aspect-square w-full bg-[var(--surface-canvas)] overflow-hidden">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="(max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <Package className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
          </span>
        )}
      </div>

      {/* Info debajo — limpia */}
      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug group-hover/card:text-[var(--accent)] transition-colors">
          {item.name}
        </p>
        <StarRating rating={item.avgRating ?? 4.8} />
        <p className="text-xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none mt-0.5">
          {pen.format(item.price)}
        </p>
      </div>
    </Link>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TopRatedBento() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/catalog?sort=popular&limit=4", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((json) => {
        const raw = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        setItems(raw as CatalogItem[]);
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <ExplorarSectionHeader
        kicker="Lo mejor calificado"
        title="Productos que enamoran"
        subtitle="Calificacion 4.5+ por clientes verificados"
        ctaLabel="Ver ranking"
        ctaHref="/marketplace/explorar?sort=rating"
      />

      {/* Grid uniforme: 4 cards iguales */}
      {items === null ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? null : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {items.slice(0, 4).map((item, idx) => (
            <UniformCard
              key={`${item.storeSlug}-${item.storeProductId}`}
              item={item}
              rank={idx + 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}
