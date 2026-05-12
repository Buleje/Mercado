"use client";

/**
 * MarketplaceBestsellersStrip — Top 10 más vendidos esta semana.
 *
 * Cards horizontales con número de ranking grande (estilo Netflix top-10),
 * imagen del producto, nombre, tienda, precio, badge de unidades vendidas.
 * Datos del endpoint top-products o fallback a productos populares.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Flame,
  ChevronRight,
  TrendingUp,
  Package,
} from "@buleje/design-system/icons";

interface BestsellerProduct {
  id: string | number;
  name: string;
  storeName: string;
  storeSlug: string;
  image: string | null;
  price: number;
  oldPrice?: number;
  unitsSold: number;
}

const fmtPrice = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function MarketplaceBestsellersStrip() {
  // Solo datos reales — si la DB no tiene bestsellers todavia, la seccion se oculta.
  // Sin FALLBACK hardcoded (Brandon: nada inventado).
  const [items, setItems] = useState<BestsellerProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketplace/bestsellers?limit=10", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items && Array.isArray(d.items)) {
          setItems(d.items);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sin data real → no render. Evita "decorar" la home con productos inventados.
  if (loading || items.length === 0) {
    return null;
  }

  return (
    <section>
      <header className="flex items-center justify-between gap-3 px-1 mb-4 sm:mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-[var(--accent)] dark:bg-rose-950/40 dark:text-[var(--accent)]">
            <Flame className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
                Más vendidos
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-white shadow-md shadow-md/30">
                <TrendingUp className="h-2.5 w-2.5" strokeWidth={3} />
                Esta semana
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-semibold mt-0.5">
              Lo que tus vecinos están comprando ahora
            </p>
          </div>
        </div>
        <Link
          href="/marketplace?sort=bestsellers"
          className="group inline-flex items-center gap-1 text-xs sm:text-sm font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors shrink-0"
        >
          Ver todos
          <ChevronRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.75}
          />
        </Link>
      </header>

      {/* Horizontal scroll cards */}
      <div className="-mx-1 overflow-x-auto scrollbar-hide">
        <div className="inline-flex gap-3 px-1 pb-2">
          {items.slice(0, 10).map((item, idx) => (
            <BestsellerCard key={item.id} item={item} rank={idx + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BestsellerCard({
  item,
  rank,
}: {
  item: BestsellerProduct;
  rank: number;
}) {
  const hasDiscount = item.oldPrice && item.oldPrice > item.price;
  const isTopThree = rank <= 3;

  return (
    <Link
      href={`/marketplace/${item.storeSlug}`}
      className="group relative shrink-0 w-[200px] sm:w-[220px] rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-[var(--accent)]/40"
    >
      {/* Rank big number — estilo Netflix top */}
      <span
        className={`absolute top-1 left-1 z-10 font-display font-extrabold leading-none select-none ${
          isTopThree
            ? "text-[80px] sm:text-[100px] text-[var(--accent)] opacity-25"
            : "text-[60px] sm:text-[80px] text-[var(--text-tertiary)] opacity-20"
        }`}
        aria-hidden
      >
        {rank}
      </span>

      {/* Image */}
      <div className="relative aspect-square bg-[var(--surface-sunken)] flex items-center justify-center">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="220px"
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized
          />
        ) : (
          <Package
            className="h-12 w-12 text-[var(--text-tertiary)]/40"
            strokeWidth={1.5}
            aria-hidden
          />
        )}

        {hasDiscount && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-md/30">
            <Flame className="h-3 w-3" strokeWidth={2.75} />
            -{Math.round(((item.oldPrice! - item.price) / item.oldPrice!) * 100)}%
          </span>
        )}

        {isTopThree && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/30">
            TOP {rank}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="relative p-3.5 space-y-1.5">
        <h3 className="font-display text-base font-black text-[var(--text-primary)] line-clamp-2 leading-tight tracking-tight">
          {item.name}
        </h3>
        <p className="text-[length:var(--ts-2xs)] font-black text-[var(--text-tertiary)] truncate uppercase tracking-wider">
          {item.storeName}
        </p>
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <p className="font-display text-lg sm:text-xl font-black tabular-nums text-[var(--text-primary)] leading-none tracking-tight">
              {fmtPrice(item.price)}
            </p>
            {hasDiscount && (
              <p className="text-[length:var(--ts-2xs)] font-black tabular-nums text-[var(--text-tertiary)] line-through leading-none">
                {fmtPrice(item.oldPrice!)}
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-0.5 text-xs font-black text-[var(--text-tertiary)] tabular-nums whitespace-nowrap">
            <Flame className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.75} />
            {item.unitsSold}
          </span>
        </div>
      </div>
    </Link>
  );
}
