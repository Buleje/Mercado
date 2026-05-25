"use client";

/**
 * OfertasFlashSection — Countdown + 4 productos en oferta flash.
 *
 * Pieza de la narrativa "Lo que esta pasando ahora" en la home del marketplace.
 * Usa MOCK_DEALS filtrado a los flash (ventanas cortas). Muestra timer global
 * hasta la oferta que vence primero y 4 cards con precio rebajado.
 *
 * Link a /marketplace/ofertas para la vista completa.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Clock,
} from "@buleje/design-system/icons";
import type { Deal } from "@/lib/mock-deals";
import { useMarketplaceDeals } from "@/hooks/use-marketplace-deals";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!targetRef.current) return;
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!target) return { hours: 0, minutes: 0, seconds: 0, expired: true };
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, expired: false };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Convierte un Deal (real) al shape que espera UnifiedProductCard */
function dealToCardProduct(deal: Deal) {
  return {
    id: deal.productId ?? 0,
    name: deal.name,
    price: deal.price,
    originalPrice: deal.previousPrice,
    image: deal.image ?? null,
    unit: deal.unit,
    storeName: deal.storeName,
    storeSlug: deal.storeSlug,
    storeProductId: deal.storeProductId,
    discount: deal.discountPct,
  };
}

export default function OfertasFlashSection() {
  // Datos REALES desde /api/marketplace/deals (sin fallback — solo
  // descuentos verdaderos para flash)
  const { flashDeals: allFlash } = useMarketplaceDeals({ limit: 12 });
  const flashDeals = useMemo(() => allFlash.slice(0, 4), [allFlash]);

  const nextToExpire = useMemo(() => {
    if (flashDeals.length === 0) return null;
    const sorted = [...flashDeals].sort(
      (a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime(),
    );
    return sorted[0].endsAt;
  }, [flashDeals]);

  const { hours, minutes, seconds, expired } = useCountdown(nextToExpire);

  if (flashDeals.length === 0) return null;

  return (
    <MarketplaceSection
      id="ofertas-flash"
      kicker="Ofertas relámpago"
      title="Termina pronto: hasta -40% en productos seleccionados"
      headerExtra={
        !expired ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-1.5">
            <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
            <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Cierra en
            </span>
            <div className="flex items-center gap-0.5 tabular-nums text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
              <span className="min-w-[1.75rem] text-center">
                {pad(hours)}
              </span>
              <span className="text-[var(--text-tertiary)]">:</span>
              <span className="min-w-[1.75rem] text-center">
                {pad(minutes)}
              </span>
              <span className="text-[var(--text-tertiary)]">:</span>
              <span className="min-w-[1.75rem] text-center">
                {pad(seconds)}
              </span>
            </div>
          </div>
        ) : undefined
      }
      actions={
        <Link
          href="/marketplace/ofertas"
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Ver todas las ofertas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      {/* Carrusel horizontal 1 fila (mobile + desktop) — drag, snap, barra mini */}
      <HorizontalCarousel ariaLabel="Ofertas relampago">
        {flashDeals.map((d, i) => (
          <UnifiedProductCard
            key={d.id}
            product={dealToCardProduct(d)}
            variant="flash"
            layout="compact"
            endsAt={new Date(d.endsAt)}
            index={i}
            href={`/marketplace/${d.storeSlug}/producto/${dealToCardProduct(d).id}`}
          />
        ))}
      </HorizontalCarousel>
    </MarketplaceSection>
  );
}
