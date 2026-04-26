"use client";

import dynamic from "next/dynamic";
import CatalogSections from "@/components/marketplace/CatalogSections";

/* ── Catalog skeleton — shown while CatalogView bundle loads ───────────────── */

function CatalogSkeleton() {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6"
      aria-busy="true"
      aria-label="Cargando catálogo..."
    >
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden" aria-hidden="true">
          <div className="aspect-square bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Dynamic import — CatalogView is large and SSR is unnecessary ──────────── */

const CatalogView = dynamic(
  () => import("@/components/marketplace/CatalogView"),
  { loading: () => <CatalogSkeleton /> }
);

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface MarketplaceCatalogViewSectionProps {
  searchQuery?: string;
  zone?: string;
  category?: string;
}

/* ── MarketplaceCatalogViewSection ──────────────────────────────────────────── */

export default function MarketplaceCatalogViewSection({
  searchQuery,
  zone,
  category,
}: MarketplaceCatalogViewSectionProps) {
  return (
    <>
      {/* ── Curated Catalog Sections ── */}
      <div className="mt-4">
        <CatalogSections />
      </div>

      {/* Sección "Para ti" removida por pedido del usuario (2026-04-21) */}

      {/* ── CatalogView — filtered product grid ── */}
      <CatalogView
        searchQuery={searchQuery}
        zone={zone}
        category={category}
      />
    </>
  );
}
