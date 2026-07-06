"use client";

/**
 * TiendasDestacadas — "Cerca tuyo": tiendas destacadas con preview de productos.
 *
 * Brandon 2026-05-24: cards más grandes/visuales + 2-3 productos reales
 * embebidos por tienda (mini preview shoppable). Data REAL de
 * /api/marketplace/featured-stores (una sola query, sin N+1). Si no hay
 * tiendas publicadas, la sección se oculta sola.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Star,
  MapPin,
  Store as StoreIcon,
  Package,
  ArrowRight,
  UtensilsCrossed,
  ShoppingBasket,
  Wrench,
  Smartphone,
  Pill,
  type LucideIcon,
} from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import { MARKETPLACE_VERTICALS, verticalForStoreCategory } from "@/lib/marketplace/verticals";

interface PreviewProduct {
  id: string;
  productId: number;
  name: string;
  image: string;
  retailPrice: number;
  discountPrice: number | null;
}

interface FeaturedStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string | null;
  zone: string | null;
  rating: number;
  reviewCount: number;
  productsCount: number;
  productosDestacados: PreviewProduct[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

// Icono por vertical — single-source con lib/marketplace/verticals.
const VERTICAL_ICONS: Record<string, LucideIcon> = {
  comida: UtensilsCrossed,
  bodega: ShoppingBasket,
  ferreteria: Wrench,
  electro: Smartphone,
  farmacia: Pill,
};

/** Card de tienda destacada (extraída para reusar en el carrusel plano y en las
 *  filas por categoría). Markup idéntico al original. */
function FeaturedStoreCard({ store }: { store: FeaturedStore }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all duration-200 hover:border-[var(--accent)]/50 hover:shadow-[0_12px_28px_-12px_color-mix(in_oklab,var(--accent)_22%,transparent)]">
      {/* Banner / logo grande */}
      <Link
        href={`/marketplace/${store.slug}`}
        className="relative block h-32 sm:h-36 bg-linear-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)]"
      >
        {store.banner || store.logo ? (
          <Image
            src={(store.banner || store.logo) as string}
            alt={store.name}
            fill
            sizes="340px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
            <StoreIcon className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        {store.rating > 0 && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-gray-800 shadow-sm backdrop-blur">
            <Star
              className="h-3.5 w-3.5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
              strokeWidth={1.75}
              aria-hidden
            />
            {Number(store.rating).toFixed(1)}
            {store.reviewCount > 0 && (
              <span className="font-medium text-gray-500">({store.reviewCount})</span>
            )}
          </span>
        )}
      </Link>

      {/* Header tienda */}
      <div className="flex items-start gap-3 px-3.5 pt-3">
        {store.logo && (
          <span className="relative -mt-8 h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-[var(--surface-raised)] bg-[var(--surface-raised)] shadow-sm">
            <Image src={store.logo} alt={`Logo de ${store.name}`} fill sizes="56px" className="object-cover" />
          </span>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <Link href={`/marketplace/${store.slug}`}>
            <h3 className="truncate text-base font-extrabold leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
              {store.name}
            </h3>
          </Link>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
            <Package className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            {store.productsCount} productos
            {store.zone && (
              <>
                <span aria-hidden>·</span>
                <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="truncate">{store.zone}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Preview de productos reales */}
      {store.productosDestacados.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 px-3.5">
          {store.productosDestacados.slice(0, 3).map((p) => (
            <Link
              key={p.id}
              href={`/marketplace/${store.slug}`}
              className="group/prod block overflow-hidden rounded-lg border border-[var(--rule-soft)] bg-white dark:bg-gray-900"
              title={p.name}
            >
              <span className="relative block aspect-square">
                {p.image ? (
                  <Image src={p.image} alt={p.name} fill sizes="100px" className="object-contain p-1" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                    <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  </span>
                )}
              </span>
              <span className="block px-1 pb-1 text-center text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-primary)]">
                {fmt(p.discountPrice ?? p.retailPrice)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-auto p-3.5 pt-3">
        <Link
          href={`/marketplace/${store.slug}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] py-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          Ver tienda
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export default function TiendasDestacadas({ initialStores }: { initialStores?: FeaturedStore[] } = {}) {
  // Brandon 2026-05-27: NO destacar tiendas vacías (productsCount === 0). Una
  // tienda sin productos no debería aparecer en "Bodegas que no puedes perderte".
  const onlyWithProducts = (list: FeaturedStore[]) =>
    list.filter((s) => (s.productsCount ?? 0) > 0);
  const [stores, setStores] = useState<FeaturedStore[]>(onlyWithProducts(initialStores ?? []));
  const [loading, setLoading] = useState(!initialStores);

  useEffect(() => {
    if (initialStores && initialStores.length > 0) return;
    let cancelled = false;
    // Respeta el Cache-Control del endpoint (max-age 120) — evita un hit de
    // red en cada montaje / back-navigation.
    fetch("/api/marketplace/featured-stores?limit=10&productsPerStore=3")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setStores(onlyWithProducts((d?.stores ?? []) as FeaturedStore[]));
      })
      .catch(() => {
        /* sección no crítica: se oculta sola si falla */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && stores.length === 0) return null;

  // Agrupar por "mundo" — mismo diseño por categoría que /tiendas. Solo agrupa
  // si hay >=2 verticales entre las destacadas; sino, carrusel plano.
  const groups: { id: string; label: string; Icon: LucideIcon; stores: FeaturedStore[] }[] = [];
  {
    const buckets = new Map<string, FeaturedStore[]>();
    for (const s of stores) {
      const vId = verticalForStoreCategory(s.category) ?? "otros";
      const arr = buckets.get(vId);
      if (arr) arr.push(s);
      else buckets.set(vId, [s]);
    }
    for (const v of MARKETPLACE_VERTICALS) {
      const arr = buckets.get(v.id);
      if (arr && arr.length) {
        groups.push({ id: v.id, label: v.label, Icon: VERTICAL_ICONS[v.id] ?? StoreIcon, stores: arr });
      }
    }
    const otras = buckets.get("otros");
    if (otras && otras.length) {
      groups.push({ id: "otros", label: "Otras tiendas", Icon: StoreIcon, stores: otras });
    }
  }
  const grouped = !loading && groups.length >= 2;

  return (
    <MarketplaceSection
      id="tiendas-destacadas"
      kicker="Cerca tuyo"
      title={grouped ? "Tiendas por categoría" : "Bodegas que no puedes perderte"}
      subtitle={
        grouped ? "Elegí el tipo de tienda que buscás" : "Las tiendas mejor calificadas de tu zona"
      }
      actions={
        <Link
          href="/tiendas"
          className="inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap"
        >
          Ver todas
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      {grouped ? (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <div key={g.id}>
              {/* Sub-header del mundo: icono + nombre + conteo. */}
              <div className="mb-3 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <g.Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <h3 className="text-base font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-lg">
                  {g.label}
                </h3>
                <span className="text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                  {g.stores.length}
                </span>
              </div>
              <HorizontalCarousel
                ariaLabel={`Tiendas de ${g.label}`}
                itemWidthClass="w-[80vw] sm:w-[340px] shrink-0 snap-start"
              >
                {g.stores.map((store) => (
                  <FeaturedStoreCard key={store.id} store={store} />
                ))}
              </HorizontalCarousel>
            </div>
          ))}
        </div>
      ) : (
        <HorizontalCarousel
          ariaLabel="Tiendas destacadas"
          itemWidthClass="w-[80vw] sm:w-[340px] shrink-0 snap-start"
        >
          {(loading ? Array.from({ length: 4 }, () => null) : stores).map((store, i) =>
            store ? (
              <FeaturedStoreCard key={store.id} store={store} />
            ) : (
              <div key={`skel-${i}`} className="h-80 rounded-2xl skeleton-shimmer" />
            ),
          )}
        </HorizontalCarousel>
      )}
    </MarketplaceSection>
  );
}
