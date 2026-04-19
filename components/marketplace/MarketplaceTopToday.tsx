"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { m } from "framer-motion";
import { Flame, TrendingUp, Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import WishlistButton from "@/components/marketplace/WishlistButton";

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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || (items !== null && items.length === 0)) return null;

  return (
    <section
      id="top-today"
      aria-label="Lo más pedido hoy"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8"
    >
      <div className="flex items-end justify-between gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400">
            Ranking {windowLabel === "7d" ? "semanal" : "diario"}
          </p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Lo más pedido {windowLabel === "7d" ? "esta semana" : "hoy"}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Los productos que los vecinos están comprando ahora mismo
          </p>
        </div>
        <Link
          href="/marketplace?vista=catalogo&sort=popular"
          className="text-xs font-bold text-gray-900 dark:text-white link-underline whitespace-nowrap shrink-0"
        >
          Ver todo →
        </Link>
      </div>

      {items === null ? (
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-44 sm:w-52 h-64 rounded-xl skeleton-shimmer"
            />
          ))}
        </div>
      ) : (
        <m.div
          className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.07, delayChildren: 0.1 },
            },
          }}
        >
          {items.map((p, idx) => (
            <m.div
              key={p.storeProductId}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className="shrink-0 w-44 sm:w-52 snap-start"
            >
            <Link
              href={`/marketplace/${p.store.slug}?p=${p.productId}`}
              className="block group"
            >
              <div className="relative rounded-xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500 transition-all">
                {/* Ranking number editorial */}
                <div className="absolute top-2 left-3 z-10 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[0.2em] text-white mix-blend-difference">
                  {String(idx + 1).padStart(2, "0")}
                </div>

                {/* Wishlist */}
                <div className="absolute top-2 right-2 z-10">
                  <WishlistButton
                    size="sm"
                    product={{
                      productId: p.productId,
                      storeSlug: p.store.slug,
                      storeName: p.store.name,
                      name: p.name,
                      price: p.price,
                      image: p.image,
                    }}
                  />
                </div>

                {/* Image */}
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt={p.name}
                      fill
                      sizes="(max-width: 640px) 176px, 208px"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <TrendingUp className="h-10 w-10" />
                    </div>
                  )}

                  {/* Sold count minimal */}
                  {p.soldUnits != null && p.soldUnits > 0 ? (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/95 dark:bg-gray-950/95 backdrop-blur border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide tabular-nums">
                      <Flame className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
                      {p.soldUnits} vend.
                    </span>
                  ) : (
                    p.badges.includes("best-seller") && (
                      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/95 dark:bg-gray-950/95 backdrop-blur border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
                        <Flame className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
                        Top
                      </span>
                    )
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-xs font-bold text-gray-900 dark:text-white line-clamp-2 min-h-[2.25rem]">
                    {p.name}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-400 truncate mt-0.5">
                    {p.store.name}
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-1">
                    <div className="flex flex-col">
                      <span className="text-base font-extrabold text-gray-900 dark:text-white">
                        S/{p.price.toFixed(2)}
                      </span>
                      {p.unit && (
                        <span className="text-[length:var(--ts-2xs)] text-gray-400">/ {p.unit}</span>
                      )}
                    </div>
                    {p.avgRating > 0 && (
                      <div className="inline-flex items-center gap-0.5 text-xs text-amber-500 font-bold">
                        <Star
                          className="h-3 w-3 fill-current"
                          aria-hidden="true"
                        />
                        {p.avgRating.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
            </m.div>
          ))}
        </m.div>
      )}
    </section>
  );
}
