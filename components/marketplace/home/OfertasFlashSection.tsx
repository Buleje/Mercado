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
import { Caption } from "@buleje/design-system";
import { MOCK_DEALS, type Deal } from "@/lib/mock-deals";
import { cn } from "@/lib/utils";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import MarketplaceSection, { MARKETPLACE_GRID } from "@/components/marketplace/MarketplaceSection";

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

/** Convierte un Deal (mock) al shape que espera UnifiedProductCard */
function dealToCardProduct(deal: Deal) {
  // MOCK_DEALS usa id string — hasheamos a number para el card
  const numId = deal.id.split("_")[1] ? parseInt(deal.id.split("_")[1], 10) : 0;
  return {
    id: numId,
    name: deal.name,
    price: deal.price,
    originalPrice: deal.previousPrice,
    image: null,
    unit: deal.unit,
    storeName: deal.storeName,
    storeSlug: deal.storeSlug,
    discount: deal.discountPct,
  };
}

export default function OfertasFlashSection() {
  const flashDeals = useMemo(
    () => MOCK_DEALS.filter((d) => d.isFlash).slice(0, 4),
    [],
  );

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
      kicker="Ofertas flash"
      title="Termina pronto: hasta -40% en productos seleccionados"
      subtitle={
        !expired
          ? undefined
          : undefined
      }
      actions={
        <Link
          href="/marketplace/ofertas"
          className={cn(
            "inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors",
          )}
        >
          Ver todas las ofertas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      {/* Countdown badge — debajo del header del wrapper */}
      {!expired && (
        <Caption className="mb-4 inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
          <Clock className="h-3 w-3" aria-hidden />
          Cierra en{" "}
          <span className="tabular-nums font-semibold text-[var(--text-secondary)]">
            {pad(hours)}:{pad(minutes)}:{pad(seconds)}
          </span>
        </Caption>
      )}

      {/* Desktop grid */}
      <div className={`hidden sm:grid ${MARKETPLACE_GRID}`}>
        {flashDeals.map((d, i) => (
          <UnifiedProductCard
            key={d.id}
            product={dealToCardProduct(d)}
            variant="flash"
            endsAt={new Date(d.endsAt)}
            index={i}
            href={`/marketplace/${d.storeSlug}/producto/${dealToCardProduct(d).id}`}
          />
        ))}
      </div>

      {/* Mobile horizontal scroll */}
      <div className="sm:hidden -mx-4 px-4 flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {flashDeals.map((d, i) => (
          <div key={d.id} className="shrink-0 w-[200px] snap-start">
            <UnifiedProductCard
              product={dealToCardProduct(d)}
              variant="flash"
              endsAt={new Date(d.endsAt)}
              index={i}
              href={`/marketplace/${d.storeSlug}/producto/${dealToCardProduct(d).id}`}
            />
          </div>
        ))}
      </div>
    </MarketplaceSection>
  );
}
