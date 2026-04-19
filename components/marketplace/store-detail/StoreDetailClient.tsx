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

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import StoreHero from "./StoreHero";
import StoreAboutBlock from "./StoreAboutBlock";
import StoreInfoCard from "./StoreInfoCard";
import StoreCategories, { type StoreCategoryChip } from "./StoreCategories";
import StoreCatalog from "./StoreCatalog";
import StoreReviews from "./StoreReviews";
import StorePoliciesBlock from "./StorePoliciesBlock";
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
}

export default function StoreDetailClient({
  store,
  products,
  categories,
  reviewSummary,
  reviews,
}: StoreDetailClientProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <nav
        aria-label="Ruta de navegacion"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5"
      >
        <ol className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          <li>
            <Link
              href="/marketplace"
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Inicio
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600" />
          </li>
          <li>
            <Link
              href="/marketplace/explorar"
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Bodegas
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600" />
          </li>
          <li className="text-gray-900 dark:text-white truncate max-w-[200px]" aria-current="page">
            {store.name}
          </li>
        </ol>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <StoreHero
        name={store.name}
        category={store.category}
        zone={store.zone}
        description={store.description}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
        illustration={store.category?.toLowerCase().includes("bodega") ? "bodega-abriendo" : "donia-elena"}
      />

      {/* ── About + Info (2 col) ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 lg:gap-12">
          <StoreAboutBlock
            storeName={store.name}
            zone={store.zone}
          />
          <StoreInfoCard
            zone={store.zone}
            schedule="Lunes a domingo · 6am a 11pm"
          />
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Categories ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StoreCategories
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
      </div>

      {/* ── Catalog ────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <StoreCatalog
          storeSlug={store.slug}
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
        <StoreReviews summary={reviewSummary} reviews={reviews} />
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
