"use client";

/**
 * OfertasClient — Orchestrator de /marketplace/ofertas.
 *
 * Stack (top → bottom):
 *   1. OfertasHero   (kicker + H1 + breadcrumb + stats + countdown strip)
 *   2. FlashDealsCountdown  (banner dark + grid 6 flash deals con timer)
 *   3. DealsFilterBar       (tabs categoria + sort + min-discount)
 *   4. DealsGrid            (grid 4 cols + pagination)
 *   5. DealsByStore         (scroll horizontal tiendas participantes)
 *   6. DealsAlert           (suscripcion email)
 *   7. FinalCTA             (link a explorar)
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@buleje/design-system/icons";
import OfertasHero from "./OfertasHero";
import FlashDealsCountdown from "./FlashDealsCountdown";
import DealsFilterBar, { type DealsFilters } from "./DealsFilterBar";
import DealsGrid from "./DealsGrid";
import DealsByStore from "./DealsByStore";
import DealsAlert from "./DealsAlert";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";
import {
  MOCK_DEALS,
  MOCK_DEAL_STORES,
  DEALS_SUMMARY,
  type Deal,
} from "@/lib/mock-deals";
import type { DealCategory } from "./types";

function sortDeals(deals: Deal[], sort: DealsFilters["sort"]): Deal[] {
  const copy = [...deals];
  switch (sort) {
    case "discount_desc":
      return copy.sort((a, b) => b.discountPct - a.discountPct);
    case "price_asc":
      return copy.sort((a, b) => a.price - b.price);
    case "ends_soon":
      return copy.sort(
        (a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime(),
      );
    case "popular":
      // MVP: popular = mayor descuento (sin datos reales de clicks)
      return copy.sort((a, b) => b.discountPct - a.discountPct);
    default:
      return copy;
  }
}

function FinalCTA() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-8 sm:p-10">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            Seguir explorando
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white">
            Explorar mas productos
          </h2>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Mas alla de las ofertas, encontras todo el catalogo de bodegas de Pucallpa en un solo lugar.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/marketplace/explorar"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary/90 transition-colors"
            >
              Ver todo el catalogo
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 px-6 py-3 text-sm font-bold text-gray-900 dark:text-white hover:bg-white dark:hover:bg-gray-950 transition-colors"
            >
              Ver bodegas
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const DEFAULT_FILTERS: DealsFilters = {
  category: "todas",
  sort: "discount_desc",
  minDiscount: 0,
};

export default function OfertasClient() {
  const [filters, setFilters] = useState<DealsFilters>(DEFAULT_FILTERS);

  const filteredDeals = useMemo(() => {
    let deals = [...MOCK_DEALS];

    if (filters.category !== "todas") {
      deals = deals.filter((d) => d.category === (filters.category as DealCategory));
    }

    if (filters.minDiscount > 0) {
      deals = deals.filter((d) => d.discountPct >= filters.minDiscount);
    }

    return sortDeals(deals, filters.sort);
  }, [filters]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs
            items={[
              { label: "Marketplace", href: "/marketplace" },
              { label: "Ofertas" },
            ]}
          />
        </div>
      </div>

      <OfertasHero summary={DEALS_SUMMARY} />

      <div className="py-10 sm:py-14 space-y-12 sm:space-y-16">
        <FlashDealsCountdown deals={MOCK_DEALS} />

        <div className="space-y-6">
          <DealsFilterBar filters={filters} onFiltersChange={setFilters} />
          <DealsGrid deals={filteredDeals} />
        </div>

        <DealsByStore stores={MOCK_DEAL_STORES} />
        <DealsAlert />
        <FinalCTA />
      </div>

      <RelatedFeatures features={relatedFor("ofertas")} />
    </div>
  );
}
