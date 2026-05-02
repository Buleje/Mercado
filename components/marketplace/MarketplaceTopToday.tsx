"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import MarketplaceEmptyState from "@/components/marketplace/MarketplaceEmptyState";

interface TopProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  avgRating: number;
  soldUnits?: number;
  badges: string[];
  store: { slug: string; name: string; rating: number };
}

function normalize(raw: Record<string, unknown>): TopProduct {
  return {
    storeProductId: String(raw.storeProductId),
    productId: Number(raw.productId),
    name: String(raw.name),
    price: Number(raw.price),
    image: (raw.image as string) ?? null,
    unit: (raw.unit as string) ?? null,
    avgRating: Number(raw.avgRating ?? raw.store_rating ?? 0),
    soldUnits: raw.soldUnits != null ? Number(raw.soldUnits) : undefined,
    badges: Array.isArray(raw.badges) ? (raw.badges as string[]) : [],
    store: {
      slug: String((raw.store as { slug?: string })?.slug ?? ""),
      name: String((raw.store as { name?: string })?.name ?? ""),
      rating: Number((raw.store as { rating?: number })?.rating ?? 0),
    },
  };
}

export default function MarketplaceTopToday() {
  const [items, setItems] = useState<TopProduct[] | null>(null);
  const [windowLabel, setWindowLabel] = useState<"24h" | "7d" | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Hard timeout — if the fetch hangs longer than 10s, surface as error
    // so we can render the empty state instead of a forever-spinning skeleton.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setError(true);
    }, 10_000);

    (async () => {
      try {
        // 1) Try real "top-today" endpoint (ranked by sold units)
        const r = await fetch("/api/marketplace/top-today?limit=10");
        if (r.ok) {
          const d = await r.json();
          if (!cancelled && Array.isArray(d?.items) && d.items.length > 0) {
            setItems(d.items.map(normalize));
            setWindowLabel(d.window === "7d" ? "7d" : "24h");
            return;
          }
        }
        // 2) Fallback: catalog by popularity
        const r2 = await fetch("/api/marketplace/catalog?sort=popular&limit=10");
        if (!r2.ok) throw new Error("catalog failed");
        const d2 = await r2.json();
        if (cancelled) return;
        setItems((d2?.items ?? []).slice(0, 10).map(normalize));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        clearTimeout(timeoutId);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // Hide section completely when we know there's nothing to show.
  // (The empty state renders inside `<MarketplaceSection>` below to keep
  // visual hierarchy when something genuinely failed but only on dev/preview;
  // in production with a populated DB this path never triggers.)
  if (error && items === null) {
    if (process.env.NODE_ENV === "production") return null;
    // dev-only diagnostic — never bubbles to real users
  }
  if (items !== null && items.length === 0) return null;

  return (
    <MarketplaceSection
      id="top-today"
      kicker={`Ranking ${windowLabel === "7d" ? "semanal" : "diario"}`}
      title={`Lo más pedido ${windowLabel === "7d" ? "esta semana" : "hoy"}`}
      subtitle="Los productos que los vecinos están comprando ahora mismo"
      actions={
        <Link
          href="/marketplace?vista=catalogo&sort=popular"
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
        >
          Ver todo
        </Link>
      }
    >
      {error && items === null ? (
        <MarketplaceEmptyState
          eyebrow="Sin datos por ahora"
          title="Aún no podemos mostrar el ranking de hoy"
          description="Refrescá en un momento o explorá el catálogo completo del marketplace mientras tanto."
        />
      ) : items === null ? (
        <HorizontalCarousel ariaLabel="Cargando lo mas pedido" showNav={false}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl skeleton-shimmer" />
          ))}
        </HorizontalCarousel>
      ) : (
        <HorizontalCarousel ariaLabel="Lo mas pedido hoy">
          {items.map((p, idx) => (
            <UnifiedProductCard
              key={p.storeProductId}
              index={idx}
              variant="top"
              rank={idx + 1}
              href={`/marketplace/${p.store.slug}?p=${p.productId}`}
              product={{
                id: p.productId,
                name: p.name,
                price: p.price,
                image: p.image,
                unit: p.unit,
                storeName: p.store.name,
                storeSlug: p.store.slug,
                storeProductId: p.storeProductId,
                description:
                  p.soldUnits != null && p.soldUnits > 0
                    ? `${p.soldUnits} vendidos hoy · ranking ${idx + 1}`
                    : `Top ${idx + 1} de hoy en Pucallpa`,
                storeRating: p.avgRating,
              }}
            />
          ))}
        </HorizontalCarousel>
      )}
    </MarketplaceSection>
  );
}
