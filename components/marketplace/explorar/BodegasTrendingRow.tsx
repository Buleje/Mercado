"use client";

/**
 * BodegasTrendingRow — 3 cards de bodegas trending side-by-side.
 * Fetch /api/marketplace/stores?limit=3&sort=popular
 *
 * Patron Buleje: 0 emojis, 0 colores hardcoded, iconos del DS.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, Package, Truck, MapPin } from "@buleje/design-system/icons";
import ExplorarSectionHeader from "./ExplorarSectionHeader";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface StoreItem {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  rating: number | null;
  productCount: number;
  zone: string | null;
  deliveryFee?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pen = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

function initial(name: string): string {
  return (name?.[0] ?? "B").toUpperCase();
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="skeleton-shimmer rounded-xl h-52 w-full" />;
}

// ── Store Card ────────────────────────────────────────────────────────────────

function StoreCard({ store }: { store: StoreItem }) {
  const rating = store.rating ?? 4.5;
  const deliveryFee = store.deliveryFee ?? 0;

  return (
    <Link
      href={`/marketplace/${store.slug}`}
      className="group flex flex-col border border-[var(--rule-soft)] bg-[var(--surface-raised)] rounded-xl p-5 sm:p-6 transition-all duration-300 hover:border-[var(--accent)]/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0"
    >
      {/* Header: avatar + nombre + zona */}
      <div className="flex items-start gap-3 mb-4">
        <div className="h-14 w-14 shrink-0 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] flex items-center justify-center overflow-hidden group-hover:border-[var(--accent)]/30 transition-colors">
          {store.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logo}
              alt={store.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xl font-black text-[var(--text-primary)]">
              {initial(store.name)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1 leading-tight">
            {store.name}
          </p>
          {store.zone && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
              <span className="text-xs font-semibold text-[var(--text-secondary)] line-clamp-1">
                {store.zone}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats — más legibles con label */}
      <div className="mt-auto pt-4 border-t border-[var(--rule-soft)] grid grid-cols-3 gap-1">
        <div className="flex flex-col items-center gap-1 py-1">
          <Star
            className="h-4 w-4 text-[var(--accent)] fill-[var(--accent)]"
            aria-hidden
          />
          {rating > 0 ? (
            <>
              <span className="text-base font-black tabular-nums text-[var(--text-primary)] leading-none">
                {rating.toFixed(1)}
              </span>
              <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                Rating
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-[var(--text-secondary)] leading-none">
              Tienda nueva
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 py-1 border-x border-[var(--rule-soft)]">
          <Package className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          <span className="text-base font-black tabular-nums text-[var(--text-primary)] leading-none">
            {store.productCount}
          </span>
          <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
            SKUs
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 py-1">
          <Truck className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          <span
            className={cn(
              "text-base font-black tabular-nums leading-none",
              deliveryFee === 0
                ? "text-[var(--data-success-500)]"
                : "text-[var(--text-primary)]",
            )}
          >
            {deliveryFee === 0 ? "Free" : pen.format(deliveryFee).replace("PEN", "")}
          </span>
          <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
            Envío
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function BodegasTrendingRow() {
  const [stores, setStores] = useState<StoreItem[] | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/stores?limit=3&sort=popular", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((json) => {
        // La API devuelve { data: [...] } o un array directo
        const raw: unknown[] = Array.isArray(json?.data)
          ? (json.data as unknown[])
          : Array.isArray(json?.items)
            ? (json.items as unknown[])
            : Array.isArray(json)
              ? (json as unknown[])
              : [];

        const mapped: StoreItem[] = raw.map((s) => {
          const store = s as Record<string, unknown>;
          const countRaw = store._count as Record<string, unknown> | null | undefined;
          return {
            id:           String(store.id ?? ""),
            slug:         String(store.slug ?? ""),
            name:         String(store.name ?? ""),
            logo:         typeof store.logo === "string" ? store.logo : null,
            rating:       typeof store.rating === "number" ? store.rating : null,
            productCount: typeof store.productCount === "number"
              ? store.productCount
              : typeof countRaw?.products === "number"
                ? (countRaw.products as number)
                : 0,
            zone:         typeof store.zone === "string" ? store.zone : null,
            deliveryFee:  typeof store.deliveryFee === "number" ? store.deliveryFee : 0,
          };
        });

        setStores(mapped.slice(0, 3));
      })
      .catch(() => setStores([]));
  }, []);

  if (stores !== null && stores.length === 0) return null;

  return (
    <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <ExplorarSectionHeader
        kicker="Bodegas activas"
        title="Tendencia esta semana"
        subtitle="Las tiendas con más ventas en Pucallpa"
        ctaLabel="Ver todas las bodegas"
        ctaHref="/tiendas"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stores === null
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          : stores.map((store) => <StoreCard key={store.id} store={store} />)}
      </div>
    </section>
  );
}
