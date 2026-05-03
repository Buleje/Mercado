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

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, X } from "@buleje/design-system/icons";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Sugerencias rápidas: matchea nombre, categoría
  const suggestions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    const results: { type: "product" | "category"; label: string; value: string }[] = [];
    // Categorías que matcheen
    for (const c of categories) {
      if (c.name.toLowerCase().includes(q) && !seen.has(`cat:${c.name}`)) {
        results.push({ type: "category", label: c.name, value: c.name });
        seen.add(`cat:${c.name}`);
      }
    }
    // Productos que matcheen
    for (const p of products) {
      if (p.productName.toLowerCase().includes(q) && !seen.has(`prod:${p.productName}`)) {
        results.push({ type: "product", label: p.productName, value: p.productName });
        seen.add(`prod:${p.productName}`);
        if (results.length >= 8) break;
      }
    }
    return results.slice(0, 8);
  }, [searchTerm, categories, products]);

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

      {/* ── Sentinel para detectar sticky ─────────────────────────────────── */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* ── Sticky bar — FULL VIEWPORT WIDTH (no max-w container) ─────────
          FIX 2026-05: Antes el sticky vivía dentro de max-w-7xl mx-auto
          y solo podía romper el padding con -mx-* — quedaba constreñido
          al ancho del catálogo. Ahora vive FUERA del container, así
          ocupa 100vw cuando hace sticky. El contenido interno se centra
          con su propio max-w-7xl mx-auto. */}
      <div
        className={cn(
          "sticky top-0 z-30 bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)] transition-shadow duration-150",
          isStuck ? "shadow-[0_2px_12px_-4px_rgba(0,0,0,0.10)]" : "shadow-none",
        )}
        style={{ contain: "layout paint" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 space-y-1.5">
          {/* Chips de categorías */}
          <StoreCategories
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            images={categoryImages}
            compact
          />

          {/* Search bar con sugerencias en dropdown — debajo de los chips.
              Adaptado: full-width en mobile, max-w-2xl en desktop centrado. */}
          <div className="relative max-w-2xl mx-auto">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
              aria-hidden
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder={`Buscar en ${store.name}…`}
              className="w-full h-10 pl-10 pr-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 transition-colors"
              aria-label="Buscar productos"
              autoComplete="off"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            )}

            {/* Sugerencias dropdown — solo cuando hay foco + matches */}
            {searchFocused && suggestions.length > 0 && (
              <div className="absolute top-full mt-1.5 left-0 right-0 z-40 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                {suggestions.map((s, idx) => (
                  <button
                    key={`${s.type}:${s.value}:${idx}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault() /* evita blur antes del click */}
                    onClick={() => {
                      if (s.type === "category") {
                        setActiveCategory(s.value);
                        setSearchTerm("");
                      } else {
                        setSearchTerm(s.value);
                      }
                      setSearchFocused(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--accent-soft)]/40 transition-colors border-b border-[var(--rule-soft)] last:border-b-0"
                  >
                    <span className={cn(
                      "inline-flex items-center justify-center h-7 w-7 rounded-full shrink-0",
                      s.type === "category" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                    )}>
                      <Search className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{s.label}</p>
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        {s.type === "category" ? "Filtrar por categoría" : "Producto"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Catalog (constrained al max-w-7xl) ───────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10">
        <StoreCatalog
          storeSlug={store.slug}
          storeName={store.name}
          storeId={store.id}
          products={products}
          activeCategory={activeCategory}
          externalSearch={searchTerm}
          onExternalSearchChange={setSearchTerm}
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
