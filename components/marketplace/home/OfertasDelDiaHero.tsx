"use client";

/**
 * OfertasDelDiaHero — "Ofertas del día": carrusel de productos destacados/en
 * oferta con badge de descuento y countdown a fin del día (urgencia comercial).
 *
 * Data REAL desde /api/marketplace/catalog/sections (campo `featured`). Antes
 * mostraba 2 hero-cards mock; Brandon pidió más productos + badge de descuento
 * + countdown. Ahora usa el patrón canónico (MarketplaceSection +
 * HorizontalCarousel + UnifiedProductCard compact), consistente con el resto
 * del home. Si no hay destacados, la sección se oculta sola.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock } from "@buleje/design-system/icons";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";

interface FeaturedProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number | string;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
  storeRating: number;
  discountPercent?: number;
}

/** Countdown a la medianoche local — las ofertas del día "cierran" a fin de día. */
function useEndOfDayCountdown(): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = end.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setLabel(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return label;
}

function toCardProduct(p: FeaturedProduct) {
  const price = Number(p.price);
  const originalPrice =
    p.discountPercent && p.discountPercent > 0
      ? Math.round((price / (1 - p.discountPercent / 100)) * 100) / 100
      : undefined;
  return {
    id: p.productId,
    name: p.name,
    price,
    originalPrice,
    image: p.image,
    storeName: p.storeName,
    storeSlug: p.storeSlug,
    storeId: p.storeId,
    storeProductId: p.storeProductId,
    storeRating: p.storeRating,
    storeLogo: p.storeLogo,
    unit: p.unit,
    category: p.category ?? undefined,
    stock: p.stock,
    discount: p.discountPercent,
  };
}

export default function OfertasDelDiaHero() {
  const [featured, setFeatured] = useState<FeaturedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const countdown = useEndOfDayCountdown();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/catalog/sections")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setFeatured(((d?.data?.featured ?? []) as FeaturedProduct[]).slice(0, 12));
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

  const cards = useMemo(() => featured.map(toCardProduct), [featured]);

  if (loading || cards.length === 0) return null;

  return (
    <MarketplaceSection
      id="ofertas-del-dia"
      kicker="Ofertas del día"
      title="Productos destacados"
      subtitle="Aprovechá hoy — los precios del día se renuevan a medianoche."
      headerExtra={
        countdown ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-1.5">
            <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
            <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Cierra en
            </span>
            <span className="tabular-nums text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
              {countdown}
            </span>
          </div>
        ) : undefined
      }
      actions={
        <Link
          href="/marketplace/ofertas"
          className="inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
        >
          Ver todas
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      <HorizontalCarousel ariaLabel="Ofertas del día">
        {cards.map((p, i) => (
          <UnifiedProductCard
            key={p.storeProductId}
            product={p}
            variant={p.discount ? "flash" : "default"}
            layout="compact"
            index={i}
          />
        ))}
      </HorizontalCarousel>
    </MarketplaceSection>
  );
}
