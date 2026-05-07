"use client";

/**
 * TiendasDestacadas — cards de tiendas cerca tuyo.
 *
 * Sección horizontal en /marketplace que muestra 6-8 tiendas destacadas
 * con avatar/logo + nombre + categoria + rating + distancia/zona.
 *
 * Card pequena (200px), single row con HorizontalCarousel.
 * Click → /marketplace/{storeSlug}.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, MapPin, Store as StoreIcon } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";

type Store = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string | null;
  rating: number | null;
  zone: string | null;
  productsCount: number;
};

export default function TiendasDestacadas() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/stores?limit=10", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const items = (d?.data ?? d?.stores ?? d ?? []) as Array<Record<string, unknown>>;
        setStores(
          items.slice(0, 10).map((s) => ({
            id: String(s.id ?? s.slug ?? Math.random()),
            slug: String(s.slug ?? ""),
            name: String(s.name ?? "Tienda"),
            logo: (s.logo as string | null) ?? (s.imageUrl as string | null) ?? null,
            category: (s.category as string | null) ?? null,
            rating: typeof s.rating === "number" ? s.rating : null,
            zone: (s.zone as string | null) ?? (s.address as string | null) ?? null,
            productsCount: typeof s.productsCount === "number" ? s.productsCount : 0,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setStores([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && stores.length === 0) return null;

  return (
    <MarketplaceSection
      id="tiendas-destacadas"
      kicker="Cerca tuyo"
      title="Bodegas que no puedes perderte"
      subtitle="Las tiendas mejor calificadas de tu zona"
      actions={
        <Link
          href="/tiendas"
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap"
        >
          Ver todas las tiendas
        </Link>
      }
    >
      <HorizontalCarousel
        ariaLabel="Tiendas destacadas"
        itemWidthClass="w-[220px] sm:w-[240px] shrink-0 snap-start"
      >
        {(loading ? Array.from({ length: 6 }, () => null) : stores).map((store, i) =>
          store ? (
            <Link
              key={store.id}
              href={`/marketplace/${store.slug}`}
              className="group block rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:shadow-[0_8px_20px_-12px_color-mix(in oklab, var(--accent) 18%, transparent)] transition-all duration-200 overflow-hidden"
            >
              {/* Logo / banner */}
              <div className="relative h-28 bg-linear-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)]">
                {store.logo ? (
                  <Image
                    src={store.logo}
                    alt={store.name}
                    fill
                    sizes="240px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                    <StoreIcon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
                  </div>
                )}
                {store.rating != null && store.rating > 0 && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 text-[length:var(--ts-2xs)] font-bold text-gray-800 backdrop-blur">
                    <Star
                      className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    {Number(store.rating).toFixed(1)}
                  </span>
                )}
              </div>
              {/* Body */}
              <div className="p-3 space-y-1">
                <h3 className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                  {store.name}
                </h3>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                  {store.category ?? "Bodega"}
                  {store.productsCount > 0 && ` · ${store.productsCount} productos`}
                </p>
                {store.zone && (
                  <p className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="truncate">{store.zone}</span>
                  </p>
                )}
              </div>
            </Link>
          ) : (
            <div key={`skel-${i}`} className="h-52 rounded-xl skeleton-shimmer" />
          ),
        )}
      </HorizontalCarousel>
    </MarketplaceSection>
  );
}
