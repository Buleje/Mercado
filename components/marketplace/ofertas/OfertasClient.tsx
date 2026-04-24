"use client";

/**
 * OfertasClient — Orchestrator de /marketplace/ofertas.
 *
 * Stack canonico (top → bottom) — alineado con ExplorarClient:
 *   1.  PromoBannerCarousel (slot="ofertas")
 *   2.  ExplorarTracker (analytics view_item_list + scroll_depth)
 *   3.  OfertasHero (kicker + h1 + countdown global + 3 stats trust)
 *   4.  FlashDealsCountdown (header editorial + countdown + carrusel UnifiedProductCard variant="flash")
 *   5.  DealsFilterBar (sticky tokens chips Holded)
 *   6.  DealsGrid (UnifiedProductCard con variant dinamico)
 *   7.  DealsByStore (ExplorarSectionHeader + carrusel)
 *   8.  DealsAlert (card editorial accent blob)
 *   9.  FinalCTA (tokenizado, igual que ExplorarClient)
 *  10.  ExplorarBackToTop FAB
 *
 * Cada seccion va envuelta en ExplorarErrorBoundary + RevealOnScroll
 * (excepto above-the-fold). SectionDividers entre bloques.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, Store } from "@buleje/design-system/icons";
import PromoBannerCarousel from "@/components/marketplace/PromoBannerCarousel";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import SectionDivider from "@/components/marketplace/home/SectionDivider";
import ExplorarErrorBoundary from "@/components/marketplace/explorar/ExplorarErrorBoundary";
import ExplorarBackToTop from "@/components/marketplace/explorar/ExplorarBackToTop";
import ExplorarTracker from "@/components/marketplace/explorar/ExplorarTracker";
import OfertasHero from "./OfertasHero";
import FlashDealsCountdown from "./FlashDealsCountdown";
import DealsFilterBar, { type DealsFilters } from "./DealsFilterBar";
import DealsGrid from "./DealsGrid";
import DealsByStore from "./DealsByStore";
import DealsAlert from "./DealsAlert";
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
      return copy.sort((a, b) => b.discountPct - a.discountPct);
    default:
      return copy;
  }
}

function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
          />
          Sigue explorando
        </p>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
          Más allá de
          <br />
          <span className="italic font-serif text-[var(--accent)]">
            las ofertas.
          </span>
        </h2>
        <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
          Todo el catálogo de bodegas, recetas y productos nuevos de Pucallpa
          en un solo lugar.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/marketplace/explorar"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
          >
            Ver todo el catálogo
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.25}
            />
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-8 py-4 text-base font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Store className="h-4 w-4" strokeWidth={1.75} />
            Ver bodegas
          </Link>
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
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="marketplace_ofertas" />
      <PromoBannerCarousel slot="ofertas" />

      {/* Hero removido — el PromoBannerCarousel ya cumple el rol editorial */}
      <ExplorarErrorBoundary section="flash-deals">
        <FlashDealsCountdown deals={MOCK_DEALS} />
      </ExplorarErrorBoundary>

      <SectionDivider />

      {/* ── Filters + Grid (sticky filter bar) ── */}
      <ExplorarErrorBoundary section="deals-filter-bar">
        <RevealOnScroll>
          <div className="space-y-6">
            <DealsFilterBar filters={filters} onFiltersChange={setFilters} />
            <DealsGrid deals={filteredDeals} />
          </div>
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      <SectionDivider />

      <ExplorarErrorBoundary section="deals-by-store">
        <RevealOnScroll>
          <DealsByStore stores={MOCK_DEAL_STORES} />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      <SectionDivider />

      <ExplorarErrorBoundary section="deals-alert">
        <RevealOnScroll>
          <DealsAlert />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      <ExplorarErrorBoundary section="ofertas-final-cta">
        <RevealOnScroll>
          <FinalCTA />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      {/* Footer vive en app/marketplace/layout.tsx (persistente). */}

      <ExplorarBackToTop />
    </div>
  );
}
