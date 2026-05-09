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
import { ArrowLeft, Search, X, Menu } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import StoreBannerArea from "./StoreBannerArea";
import StoreHero from "./StoreHero";
import StorePromoBannersStrip from "./StorePromoBannersStrip";
import { type StoreCategoryChip } from "./StoreCategories";
import StoreCategoriesSidebar from "./StoreCategoriesSidebar";
import StoreCatalog from "./StoreCatalog";
import StoreReviews from "./StoreReviews";
import StorePoliciesBlock from "./StorePoliciesBlock";
import ClosedNowBanner from "./ClosedNowBanner";
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
  /** Horario configurado por el dueño (jsonb). Para mostrar en el banner cerrado. */
  hoursJson?: unknown;
  /** ISO timestamp de la próxima apertura — derivado server-side. */
  nextOpeningAt?: string | null;
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
  hoursJson,
  nextOpeningAt,
}: StoreDetailClientProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileCatOpen, setMobileCatOpen] = useState(false);

  // Cierra el drawer mobile cuando seleccionan una categoría
  const handleCategorySelect = useCallback((cat: string | null) => {
    setActiveCategory(cat);
    setMobileCatOpen(false);
  }, []);

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
      {/* ── Banner cerrado (si la tienda está fuera de horario) ──────────── */}
      {!isOpen && (
        <ClosedNowBanner
          hours={hoursJson}
          nextOpeningAt={nextOpeningAt ?? null}
          storeName={store.name}
        />
      )}

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

      {/* ── Search bar sticky FULL VIEWPORT WIDTH ─────────────────────────
          La búsqueda es lo más prominente. Se mantiene visible al scrollear.
          El sidebar de categorías va ABAJO de esto, no en el sticky. */}
      <div
        className={cn(
          "sticky top-0 z-30 bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)] transition-shadow duration-150",
          isStuck ? "shadow-[0_2px_12px_-4px_rgba(0,0,0,0.10)]" : "shadow-none",
        )}
        style={{ contain: "layout paint" }}
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2">
            {/* Mobile: botón Categorías → abre drawer */}
            <button
              type="button"
              onClick={() => setMobileCatOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/50 transition-colors shrink-0"
              aria-label="Abrir categorías"
            >
              <Menu className="h-4 w-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Categorías</span>
              {activeCategory && (
                <span className="inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white text-[length:var(--ts-2xs)] font-black">
                  1
                </span>
              )}
            </button>

            {/* Search bar grande + prominente */}
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]"
                aria-hidden
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder={`Buscar en ${store.name}…`}
                className="w-full h-12 pl-12 pr-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 transition-colors"
                aria-label="Buscar productos"
                autoComplete="off"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}

              {/* Sugerencias dropdown */}
              {searchFocused && suggestions.length > 0 && (
                <div className="absolute top-full mt-1.5 left-0 right-0 z-40 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                  {suggestions.map((s, idx) => (
                    <button
                      key={`${s.type}:${s.value}:${idx}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (s.type === "category") {
                          setActiveCategory(s.value);
                          setSearchTerm("");
                        } else {
                          setSearchTerm(s.value);
                        }
                        setSearchFocused(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--accent-soft)]/40 transition-colors border-b border-[var(--rule-soft)] last:border-b-0"
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center h-8 w-8 rounded-full shrink-0",
                        s.type === "category" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                      )}>
                        <Search className="h-4 w-4" />
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
      </div>

      {/* ── Layout: SIDEBAR (lg+) + CATALOG ─────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10">
        <div className="flex gap-6 lg:gap-8">
          {/* Sidebar desktop — sticky, vertical, scroll interno si hay muchas categorias */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-[5.5rem]">
              <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 shadow-sm max-h-[calc(100vh-7rem)] overflow-y-auto">
                <StoreCategoriesSidebar
                  categories={categories}
                  activeCategory={activeCategory}
                  onCategoryChange={handleCategorySelect}
                  images={categoryImages}
                />
              </div>
            </div>
          </aside>

          {/* Main: catálogo */}
          <main className="flex-1 min-w-0">
            <StoreCatalog
              storeSlug={store.slug}
              storeName={store.name}
              storeId={store.id}
              products={products}
              activeCategory={activeCategory}
              externalSearch={searchTerm}
              onExternalSearchChange={setSearchTerm}
            />
          </main>
        </div>
      </div>

      {/* ── Drawer mobile — overlay con lista de categorías ────────────── */}
      {mobileCatOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Categorías"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileCatOpen(false)}
          />
          <div className="relative ml-auto h-full w-[85vw] max-w-sm bg-[var(--surface-canvas)] shadow-2xl flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <p className="text-base font-black text-[var(--text-primary)]">Categorías</p>
              <button
                type="button"
                onClick={() => setMobileCatOpen(false)}
                aria-label="Cerrar categorías"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--surface-sunken)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <StoreCategoriesSidebar
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={handleCategorySelect}
                images={categoryImages}
                hideHeader
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Reviews ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StoreReviews summary={reviewSummary} reviews={reviews} storeSlug={store.slug} storeName={store.name} />
      </div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Policies ───────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StorePoliciesBlock />
      </div>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-[var(--surface-alt)] dark:bg-gray-900 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-white mb-1">
              ¿Sos el dueño de esta tienda?
            </p>
            <p className="text-sm text-[var(--text-secondary)] dark:text-gray-400">
              Reclamá tu tienda y gestioná tu catálogo desde el panel de vendedor.
            </p>
          </div>
          <Link
            href="/marketplace/negocios"
            className="flex-shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] dark:text-gray-300 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
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
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
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
