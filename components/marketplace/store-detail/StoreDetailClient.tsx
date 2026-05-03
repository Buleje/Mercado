"use client";

/**
 * StoreDetailClient — Orchestrator de /marketplace/[slug].
 *
 * Layout:
 *   Breadcrumb
 *   StoreHero (kicker + h1 + stats + CTAs + ilustración)
 *   StoreAbout + StoreInfoCard (2 col)
 *   StoreCategories (chips)
 *   StoreCatalog (grid filtrable)
 *   StoreReviews
 *   StorePoliciesBlock
 *   FinalCTA
 *
 * El estado `activeCategory` se eleva aquí para conectar
 * StoreCategories → StoreCatalog sin setState en useEffect.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import StoreBannerArea from "./StoreBannerArea";
import StoreHero from "./StoreHero";
import StorePromoBannersStrip from "./StorePromoBannersStrip";
import StoreCategories, { type StoreCategoryChip } from "./StoreCategories";
import StoreCatalog from "./StoreCatalog";
import StoreReviews from "./StoreReviews";
import StorePoliciesBlock from "./StorePoliciesBlock";
import { getStoreTagline } from "@/lib/store-tagline";
import type { DbStore, DbStoreProduct } from "@/lib/db/marketplace.db";
import type {
  MockStoreReview,
  MockStoreRatingSummary,
} from "@/lib/mock-store-reviews";

interface StoreDetailClientProps {
  store: DbStore;
  products: DbStoreProduct[];
  categories: StoreCategoryChip[];
  reviewSummary: MockStoreRatingSummary;
  reviews: MockStoreReview[];
  /** Calculado server-side desde openHours; default true si null. */
  isOpen?: boolean;
  /** Métodos de pago expuestos por la tienda. Por ahora yape+efectivo. */
  paymentMethods?: string[];
  /** Mapa name → URL imagen (resolved server-side: per-store > global) */
  categoryImages?: Record<string, string>;
}

export default function StoreDetailClient({
  store,
  products,
  categories,
  reviewSummary,
  reviews,
  isOpen = true,
  paymentMethods = ["yape", "efectivo"],
  categoryImages,
}: StoreDetailClientProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Detección de sticky scroll: cuando el sentinel sale del viewport,
  // el bar de categorías está pegado al top y rendea en modo `compact`.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // Si el sentinel NO está visible → el sticky bar quedó pegado arriba.
        if (entry) setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* ── Banner area (custom o default Buleje) ──────────────────────────── */}
      <StoreBannerArea
        banner={store.banner ?? null}
        logo={store.logo ?? null}
        name={store.name}
        category={store.category}
        zone={store.zone}
      />

      {/* ── Botón Volver ─────────────────────────────────────────────────── */}
      <BackToTiendasButton />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <StoreHero
        name={store.name}
        category={store.category}
        zone={store.zone}
        description={getStoreTagline({
          slug: store.slug,
          name: store.name,
          category: store.category,
          existing: store.description,
        })}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
        scheduleLabel="Lun a Dom · 7am – 11pm"
        isOpen={isOpen}
        paymentMethods={paymentMethods}
      />

      {/* ── Promociones de la tienda (gestionadas por el dueño desde su admin) ─ */}
      <StorePromoBannersStrip storeSlug={store.slug} storeName={store.name} />

      {/* ── Categories sticky + Catalog ───────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        {/* Sentinel: detecta cuando el bar queda sticky arriba */}
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        {/* FIX 2026-05: el sticky bar antes hacía:
              - bg-[var(--surface-canvas)]/95 + backdrop-blur-md → blur en
                cada frame de scroll = 60fps→25fps en mid-range.
              - transition-[padding] + isStuck toggle → relayout cada vez
                que cruzaba el sentinel = jitter visible.
            Ahora: bg sólido + padding fijo + will-change/contain hints
            para que el browser pinte solo este layer. Animación queda en
            opacity de la sombra (GPU-accelerated). */}
        <div
          className={cn(
            "sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-6 py-2 bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)] transition-shadow duration-150",
            isStuck ? "shadow-[0_2px_8px_-4px_rgba(0,0,0,0.08)]" : "shadow-none",
          )}
          style={{ contain: "layout paint", willChange: "transform" }}
        >
          {/* FIX 2026-05: ANTES los chips morphaban entre "card vertical
              110px" (top) y "rectangular h-10" (stuck) cada vez que cruzaba
              el sentinel. Eso recalculaba el layout de TODOS los chips de
              golpe = jitter visible al scrollear. AHORA siempre compact:
              chips estables, sin morph, scroll fluido. */}
          <StoreCategories
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            images={categoryImages}
            compact
          />
        </div>
        <StoreCatalog
          storeSlug={store.slug}
          storeName={store.name}
          storeId={store.id}
          products={products}
          activeCategory={activeCategory}
        />
      </div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Reviews ────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StoreReviews summary={reviewSummary} reviews={reviews} storeSlug={store.slug} storeName={store.name} />
      </div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Policies ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StorePoliciesBlock />
      </div>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              ¿Sos el dueño de esta tienda?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Reclamá tu tienda y gestioná tu catálogo desde el panel de vendedor.
            </p>
          </div>
          <Link
            href="/marketplace/negocios"
            className="flex-shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
          >
            Registrar mi negocio
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Botón Volver ───────────────────────────────────────────────────────────
function BackToTiendasButton() {
  const router = useRouter();
  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/tiendas");
    }
  }, [router]);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-2.5 px-5 h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
        aria-label="Volver a Tiendas"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        <span>Volver a Tiendas</span>
      </button>
    </div>
  );
}
