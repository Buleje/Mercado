"use client";

/**
 * MisTiendasFavoritasStrip — TS-X carrusel personalizado del cliente.
 *
 * Diseño tipo Rappi: card con banner de la tienda + avatar circular +
 * nombre + meta inline. Auto-activado solo cuando el customer cumple
 * con el umbral de personalización: pedidos >= 5 en tiendas distintas
 * >= 5. Antes de eso no se muestra (sigue habiendo TusTiendasStrip
 * para historial corto).
 *
 * Data sources:
 *   - useCustomerOrders → orders[] con storeSlug
 *   - /api/marketplace/stores → enriquece con name, logo, banner, zone,
 *     rating, deliveryMinutes
 *
 * Algoritmo: count por slug → top 5 → join con catálogo de tiendas.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Clock, Truck } from "@buleje/design-system/icons";
import { useCustomerOrders } from "@/hooks/use-customer-orders";
import MiniBulejeBanner from "./MiniBulejeBanner";

interface MarketplaceStoreFull {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner?: string | null;
  category: string;
  zone?: string | null;
  rating: number;
  reviewCount: number;
  deliveryMinutes?: number;
  freeDelivery?: boolean;
}

const RESERVED_SLUGS = new Set(["main", "default", "tenant"]);
const MIN_TOTAL_ORDERS = 5;
const MIN_DISTINCT_STORES = 5;
const TOP_N = 5;

export default function MisTiendasFavoritasStrip() {
  const { orders } = useCustomerOrders();
  const [allStores, setAllStores] = useState<MarketplaceStoreFull[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Top stores con count
  const ranking = useMemo(() => {
    const counter = new Map<string, number>();
    for (const o of orders) {
      const slug = o.storeSlug;
      if (!slug || RESERVED_SLUGS.has(slug)) continue;
      counter.set(slug, (counter.get(slug) ?? 0) + 1);
    }
    const total = orders.length;
    const distinct = counter.size;
    const top = [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([slug, count]) => ({ slug, count }));
    return { total, distinct, top };
  }, [orders]);

  // Eligibilidad: 5 pedidos en 5 tiendas distintas
  const eligible =
    ranking.total >= MIN_TOTAL_ORDERS && ranking.distinct >= MIN_DISTINCT_STORES;

  useEffect(() => {
    if (!eligible || loaded) return;
    let cancelled = false;
    fetch("/api/marketplace/stores")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const items = (data.data ?? []) as MarketplaceStoreFull[];
        setAllStores(items);
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eligible, loaded]);

  const enriched = useMemo(() => {
    if (!eligible) return [];
    const bySlug = new Map(allStores.map((s) => [s.slug, s]));
    return ranking.top
      .map(({ slug, count }) => {
        const meta = bySlug.get(slug);
        if (!meta) return null;
        return { ...meta, orderCount: count };
      })
      .filter((s): s is MarketplaceStoreFull & { orderCount: number } => s != null);
  }, [eligible, allStores, ranking.top]);

  if (!eligible || enriched.length === 0) return null;

  return (
    <section
      aria-labelledby="mis-favoritas-heading"
      className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16"
    >
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Para vos
          </p>
          <h2
            id="mis-favoritas-heading"
            className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]"
          >
            Tus tiendas favoritas
          </h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Las {enriched.length} tiendas donde más comprás —
            <span className="font-semibold text-[var(--text-secondary)]">
              {" "}
              {ranking.total} pedidos en {ranking.distinct} tiendas
            </span>
          </p>
        </div>
      </header>

      {/* Mobile horizontal scroll, desktop grid 5 col */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto sm:overflow-visible scrollbar-none">
        <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory sm:snap-none">
          {enriched.map((store, idx) => (
            <FavoriteStoreCard key={store.id} store={store} rank={idx + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FavoriteStoreCard ──────────────────────────────────────────────────────── */

function FavoriteStoreCard({
  store,
  rank,
}: {
  store: MarketplaceStoreFull & { orderCount: number };
  rank: number;
}) {
  const initial = store.name.trim().charAt(0).toUpperCase();
  const deliveryWindow =
    store.deliveryMinutes && store.deliveryMinutes > 0
      ? `${Math.max(15, store.deliveryMinutes - 10)}–${store.deliveryMinutes + 5} min`
      : "25–35 min";

  return (
    <Link
      href={`/marketplace/${store.slug}`}
      className="snap-start shrink-0 w-56 sm:w-auto group flex flex-col rounded-2xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_color-mix(in oklab, var(--accent) 18%, transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {/* Banner area */}
      <div className="relative aspect-[4/3]">
        {store.banner ? (
          <Image
            src={store.banner}
            alt={`Banner de ${store.name}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width:640px) 224px, 280px"
          />
        ) : (
          <MiniBulejeBanner storeName={store.name} category={store.category} />
        )}
        {/* Rank badge */}
        <span className="absolute top-2 left-2 inline-flex items-center justify-center h-7 w-7 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-[length:var(--ts-2xs)] font-black tabular-nums shadow-md ring-2 ring-white/85 dark:ring-gray-950/85">
          #{rank}
        </span>
        {/* Order count chip */}
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)]/95 backdrop-blur-sm border border-[var(--rule-base)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] shadow-sm">
          {store.orderCount} {store.orderCount === 1 ? "pedido" : "pedidos"}
        </span>
        {/* Avatar logo overlay bottom-left */}
        <div className="absolute -bottom-4 left-3">
          <div className="h-12 w-12 rounded-xl overflow-hidden bg-[var(--surface-raised)] border-2 border-[var(--surface-canvas)] shadow-md flex items-center justify-center">
            {store.logo ? (
              <Image
                src={store.logo}
                alt={`Logo de ${store.name}`}
                width={48}
                height={48}
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-base font-black text-white bg-linear-to-br from-[var(--accent)] to-[var(--accent)]/70 h-full w-full flex items-center justify-center">
                {initial}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-3 pt-6 pb-3 flex flex-col gap-1.5">
        <h3 className="text-base font-black tracking-tight text-[var(--text-primary)] leading-tight line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
          {store.name}
        </h3>
        <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          {store.rating > 0 && (
            <span className="inline-flex items-center gap-0.5 font-bold text-[var(--text-primary)]">
              <Star className="h-3 w-3 fill-[var(--accent)] text-[var(--accent)]" aria-hidden />
              {store.rating.toFixed(1)}
            </span>
          )}
          {store.zone && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{store.zone}</span>
            </>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between pt-1.5 border-t border-[var(--rule-soft)]">
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
            <Clock className="h-3 w-3" aria-hidden />
            {deliveryWindow}
          </span>
          {store.freeDelivery && (
            <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-600)] dark:text-emerald-400">
              <Truck className="h-3 w-3" aria-hidden />
              Gratis
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
