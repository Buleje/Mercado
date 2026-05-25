"use client";

/**
 * MarketplaceBestsellersStrip — Top 10 más vendidos esta semana.
 *
 * Cards verticales (UnifiedProductCard layout="compact" variant="top") en un
 * HorizontalCarousel con drag + snap. Antes usaba un BestsellerCard propio
 * (duplicado, sin botón "Agregar") — migrado al card único del marketplace
 * para consistencia visual + add-to-cart funcional. Datos reales del endpoint
 * /api/marketplace/bestsellers; si la DB no tiene ventas aún, se oculta sola.
 *
 * SSR-ready: acepta `initialItems` para sembrar datos desde el servidor (SEO).
 * Si se reciben datos iniciales, el useEffect NO hace fetch (evita doble carga).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Flame,
  ChevronRight,
  TrendingUp,
} from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";

interface BestsellerProduct {
  id: number;
  storeProductId: string;
  productId: number;
  name: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  unit: string | null;
  category: string | null;
  stock: number;
  unitsSold: number;
}

export default function MarketplaceBestsellersStrip(
  { initialItems }: { initialItems?: BestsellerProduct[] } = {}
) {
  // Solo datos reales — si la DB no tiene bestsellers todavia, la seccion se oculta.
  // Sin FALLBACK hardcoded (Brandon: nada inventado).
  const [items, setItems] = useState<BestsellerProduct[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems);
  // Ref estable para que el useEffect no se re-ejecute si el padre re-renderiza
  // con una nueva referencia de array (los datos SSR no cambian tras el montaje).
  const hasInitialItems = useRef(Boolean(initialItems && initialItems.length > 0));

  useEffect(() => {
    // Si ya tenemos datos sembrados desde el servidor, no hacer fetch.
    if (hasInitialItems.current) return;

    let cancelled = false;
    fetch("/api/marketplace/bestsellers?limit=10", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.items && Array.isArray(d.items)) {
          setItems(d.items);
        }
      })
      .catch(() => {
        /* strip no crítico — rechazo intencional: si el fetch falla, la sección se oculta sola */
        return;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sin data real → no render. Evita "decorar" la home con productos inventados.
  if (loading || items.length === 0) {
    return null;
  }

  return (
    <section>
      <header className="flex items-center justify-between gap-3 px-1 mb-2.5 sm:mb-5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="inline-flex h-7 w-7 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-[var(--accent)] dark:bg-rose-950/40 dark:text-[var(--accent)]">
            <Flame className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h2 className="font-display text-base sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                Más vendidos
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white shadow-md shadow-md/30">
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
          className="group inline-flex items-center gap-1 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors shrink-0"
        >
          Ver todos
          <ChevronRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.75}
          />
        </Link>
      </header>

      {/* Carrusel horizontal — card vertical compacto + ranking (variant top) */}
      <HorizontalCarousel ariaLabel="Más vendidos">
        {items.slice(0, 10).map((item, idx) => (
          <UnifiedProductCard
            key={item.storeProductId}
            product={{
              id: item.productId,
              name: item.name,
              price: item.price,
              originalPrice: item.originalPrice ?? undefined,
              image: item.image,
              storeName: item.storeName,
              storeSlug: item.storeSlug,
              storeId: item.storeId,
              storeProductId: item.storeProductId,
              unit: item.unit,
              category: item.category ?? undefined,
              stock: item.stock,
            }}
            variant="top"
            rank={idx + 1}
            layout="compact"
            index={idx}
            href={`/marketplace/${item.storeSlug}`}
          />
        ))}
      </HorizontalCarousel>
    </section>
  );
}
