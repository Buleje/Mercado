"use client";

/**
 * OfertasClient — Orchestrator de /marketplace/ofertas.
 *
 * Datos REALES desde /api/marketplace/deals (productos con descuento de
 * tiendas marketplace activas). Sin mocks, sin rellenos. Si no hay
 * descuentos reales, mostramos los productos de menor precio del
 * marketplace como "destacados" (fallbackToLowest=true) y dejamos claro
 * en la UI que son "los precios más bajos" — no descuentos inventados.
 *
 * Stack:
 *  1. PromoBannerCarousel (slot="ofertas") — banners curados desde superadmin
 *  2. OfertasHero / FlashDealsCountdown — solo si hay ofertas reales
 *  3. DealsFilterBar (sticky) + DealsGrid (UnifiedProductCard)
 *  4. DealsByStore — top N bodegas con ofertas activas
 *  5. DealsAlert + FinalCTA
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Store, Tag } from "@buleje/design-system/icons";
import PromoHeroSlot from "@/components/marketplace/TiendasHeroAds";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import SectionDivider from "@/components/marketplace/home/SectionDivider";
import ExplorarErrorBoundary from "@/components/marketplace/explorar/ExplorarErrorBoundary";
import ExplorarBackToTop from "@/components/marketplace/explorar/ExplorarBackToTop";
import ExplorarTracker from "@/components/marketplace/explorar/ExplorarTracker";
import FlashDealsCountdown from "./FlashDealsCountdown";
import DealsFilterBar, { type DealsFilters } from "./DealsFilterBar";
import DealsGrid from "./DealsGrid";
import DealsByStore from "./DealsByStore";
import DealsAlert from "./DealsAlert";
import type { Deal, DealStore } from "@/lib/mock-deals";
import type { DealCategory } from "./types";

// ── Endpoint shape ──────────────────────────────────────────────────────────
type ApiDeal = {
  id: string;
  productId: number;
  name: string;
  image: string | null;
  category: string;
  unit: string;
  badge: string | null;
  price: number;
  originalPrice: number | null;
  discountPct: number;
  stock: number;
  minOrderQty: number;
  store: { slug: string; name: string; logo: string | null; zone: string | null; category: string };
};

type DealsResponse = { data: ApiDeal[]; total: number; source: "deals" | "lowest" };

// Mapea categoría libre del Product a DealCategory del filtro de UI.
function mapCategory(c: string): DealCategory {
  const k = c.toLowerCase();
  if (k.includes("frut") || k.includes("verdur") || k.includes("carne") || k.includes("frescos")) return "frescos";
  if (k.includes("bebida")) return "bebidas";
  if (k.includes("limpie")) return "limpieza";
  if (k.includes("lácte") || k.includes("lacte")) return "lacteos";
  if (k.includes("farma")) return "farmacia";
  return "abarrotes";
}

function adapt(d: ApiDeal): Deal {
  const previous = d.originalPrice ?? d.price;
  return {
    id: d.id,
    name: d.name,
    category: mapCategory(d.category),
    price: d.price,
    previousPrice: previous,
    discountPct: d.discountPct,
    unit: d.unit,
    storeName: d.store.name,
    storeSlug: d.store.slug,
    // Visual QA P0-7 fix 2026-04-30: el API actualmente NO devuelve endsAt
    // real — se usa fallback de 7 días para evitar urgencia falsa de "23h 59m"
    // que mostraba el placeholder de 24h. Cuando el endpoint /api/marketplace/deals
    // exponga endsAt real, este fallback queda como graceful degradation.
    endsAt:
      (d as { endsAt?: string }).endsAt ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    isFlash: d.discountPct >= 30,
    productId: d.productId,
    storeProductId: d.id,
    image: d.image,
    stock: d.stock,
  };
}

function buildStoreSummary(deals: Deal[]): DealStore[] {
  const byStore = new Map<string, { name: string; slug: string; zone: string; pcts: number[] }>();
  for (const d of deals) {
    const cur = byStore.get(d.storeSlug) ?? { name: d.storeName, slug: d.storeSlug, zone: "", pcts: [] };
    cur.pcts.push(d.discountPct);
    byStore.set(d.storeSlug, cur);
  }
  return [...byStore.values()].map((s) => ({
    id: s.slug,
    name: s.name,
    slug: s.slug,
    zone: s.zone,
    activeDeals: s.pcts.length,
    maxDiscountPct: s.pcts.reduce((a, b) => Math.max(a, b), 0),
    avgDiscountPct: Math.round(s.pcts.reduce((a, b) => a + b, 0) / Math.max(s.pcts.length, 1)),
  }));
}

function sortDeals(deals: Deal[], sort: DealsFilters["sort"]): Deal[] {
  const copy = [...deals];
  switch (sort) {
    case "discount_desc":
      return copy.sort((a, b) => b.discountPct - a.discountPct);
    case "price_asc":
      return copy.sort((a, b) => a.price - b.price);
    case "ends_soon":
      return copy.sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
    case "popular":
      return copy.sort((a, b) => b.discountPct - a.discountPct);
    default:
      return copy;
  }
}

const DEFAULT_FILTERS: DealsFilters = {
  category: "todas",
  sort: "discount_desc",
  minDiscount: 0,
};

// ── Empty / Honest copy banner ──────────────────────────────────────────────
function HonestNotice({ source }: { source: "deals" | "lowest" }) {
  if (source === "deals") return null;
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 sm:p-5 flex items-start gap-3">
        <div aria-hidden className="shrink-0 mt-0.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
        <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
          <strong className="text-[var(--text-primary)]">Sin descuentos publicados hoy.</strong>{" "}
          Mientras las bodegas suben sus ofertas, te mostramos los <em>precios más bajos</em> reales del marketplace, ordenados de menor a mayor. Sin descuentos inventados.
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="max-w-3xl mx-auto px-4 py-20">
      <div className="text-center">
        {/* Visual QA P1 fix 2026-04-30: emoji 🛒 reemplazado por icono Lucide
            del DS (regla bsm-design-system: no emojis decorativos). */}
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"
        >
          <Tag className="h-10 w-10" strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] mb-3">
          Todavía no hay ofertas activas
        </h2>
        <p className="text-base text-[var(--text-secondary)] leading-relaxed mb-8 max-w-xl mx-auto">
          Las bodegas de Pucallpa están subiendo sus descuentos. Volvé pronto — o explorá las tiendas activas y descubrí lo que ya está disponible.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          <Link
            href="/tiendas"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
          >
            <Store className="h-4 w-4" strokeWidth={1.75} />
            Ver bodegas
          </Link>
          <Link
            href="/marketplace/explorar"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-6 py-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
          >
            Explorar marketplace
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
          </Link>
        </div>

        {/* CTA secundaria — captura leads de bodegueros */}
        <div className="rounded-2xl bg-[var(--accent)]/8 border border-[var(--accent)]/20 p-6 sm:p-8 text-left max-w-xl mx-auto">
          <p className="text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Sos bodeguero
          </p>
          <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)] mb-2">
            ¿Querés publicar tus ofertas acá?
          </h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
            Tu bodega en el marketplace de Buleje, con tus precios reales, tus descuentos y tus clientes del barrio. Cero comisión inicial.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/registro"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-4 py-2 text-xs font-bold hover:opacity-90 transition-opacity"
            >
              Crear mi tienda
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
            </Link>
            <Link
              href="/marketplace/como-pagar"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 text-[var(--accent)] px-4 py-2 text-xs font-bold hover:bg-[var(--accent)]/10 transition-colors"
            >
              ¿Cómo cobrás?
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
          <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
          Sigue explorando
        </p>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
          Más allá de
          <br />
          <span className="italic font-serif text-[var(--accent)]">las ofertas.</span>
        </h2>
        <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
          Todo el catálogo de bodegas de Ciudad Constitución y Pucallpa en un solo lugar.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/marketplace/explorar"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
          >
            Ver todo el catálogo
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.25} />
          </Link>
          <Link
            href="/tiendas"
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

export default function OfertasClient() {
  const [filters, setFilters] = useState<DealsFilters>(DEFAULT_FILTERS);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [stores, setStores] = useState<DealStore[]>([]);
  const [source, setSource] = useState<"deals" | "lowest" | "loading">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        // Solo ofertas reales (sin fallback). Si no hay, mostramos empty state.
        const res = await fetch("/api/marketplace/deals?limit=80", { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DealsResponse;
        const adapted = (json.data ?? []).map(adapt);
        setAllDeals(adapted);
        setStores(buildStoreSummary(adapted));
        setSource(json.source);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("No pudimos cargar las ofertas. Probá recargando la página.");
        setSource("deals");
      }
    })();
    return () => ctrl.abort();
  }, []);

  const filteredDeals = useMemo(() => {
    let deals = [...allDeals];
    if (filters.category !== "todas") {
      deals = deals.filter((d) => d.category === (filters.category as DealCategory));
    }
    if (filters.minDiscount > 0) {
      deals = deals.filter((d) => d.discountPct >= filters.minDiscount);
    }
    return sortDeals(deals, filters.sort);
  }, [filters, allDeals]);

  const flashDeals = useMemo(() => allDeals.filter((d) => d.isFlash).slice(0, 12), [allDeals]);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="marketplace_ofertas" />
      {/* Designer audit P0: el PromoBannerCarousel mostraba "Ofertas
          relámpago — hasta -40%" aunque la página estuviera vacía. Ocultar
          cuando no hay deals reales — no le mentimos al usuario. */}
      {allDeals.length > 0 && <PromoHeroSlot slot="ofertas" moreLabel="Más ofertas" />}

      {error && (
        <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="rounded-2xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-500)]">
            {error}
          </div>
        </section>
      )}

      {source === "loading" ? null : allDeals.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <HonestNotice source={source} />

          {flashDeals.length > 0 && (
            <ExplorarErrorBoundary section="flash-deals">
              <FlashDealsCountdown deals={flashDeals} />
            </ExplorarErrorBoundary>
          )}

          <SectionDivider />

          <ExplorarErrorBoundary section="deals-filter-bar">
            <RevealOnScroll>
              <div className="space-y-6">
                <DealsFilterBar filters={filters} onFiltersChange={setFilters} />
                <DealsGrid deals={filteredDeals} />
              </div>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          {stores.length > 0 && (
            <>
              <SectionDivider />
              <ExplorarErrorBoundary section="deals-by-store">
                <RevealOnScroll>
                  <DealsByStore stores={stores} />
                </RevealOnScroll>
              </ExplorarErrorBoundary>
            </>
          )}

          <SectionDivider />

          <ExplorarErrorBoundary section="deals-alert">
            <RevealOnScroll>
              <DealsAlert />
            </RevealOnScroll>
          </ExplorarErrorBoundary>
        </>
      )}

      <ExplorarErrorBoundary section="ofertas-final-cta">
        <RevealOnScroll>
          <FinalCTA />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      <ExplorarBackToTop />
    </div>
  );
}
