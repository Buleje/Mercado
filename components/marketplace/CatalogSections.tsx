"use client";

import { useState, useEffect } from "react";
import {
  Star,
  Flame,
  Award,
  Zap,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import { MARKETPLACE_GRID } from "@/components/marketplace/MarketplaceSection";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface SectionProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
  storeRating: number;
  discountPercent?: number;
  promoName?: string | null;
  rank?: number;
}

interface SectionsData {
  featured: SectionProduct[];
  flashDeals: SectionProduct[];
  topSellers: SectionProduct[];
  liquidations: SectionProduct[];
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

/** Convierte un SectionProduct al shape que espera UnifiedProductCard */
function toCardProduct(p: SectionProduct) {
  return {
    id: p.productId,
    name: p.name,
    price: p.price,
    image: p.image,
    storeName: p.storeName,
    storeSlug: p.storeSlug,
    storeId: p.storeId,
    storeProductId: p.storeProductId,
    storeRating: p.storeRating,
    unit: p.unit,
    category: p.category ?? undefined,
    stock: p.stock,
    discount: p.discountPercent,
  };
}

/* ── Section Wrapper ───────────────────────────────────────────────────────── */

function Section({
  title,
  icon,
  accentColor,
  children,
  isEmpty,
}: {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  if (isEmpty) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "inline-flex items-center justify-center h-8 w-8 rounded-xl",
              accentColor
            )}
          >
            {icon}
          </span>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 dark:text-foreground">
            {title}
          </h2>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────────────── */

function SectionSkeleton() {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-8 w-8 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-5 w-40 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card overflow-hidden"
          >
            <div className="aspect-square bg-gray-100 dark:bg-surface animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-gray-100 dark:bg-surface rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-gray-100 dark:bg-surface rounded w-1/2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export default function CatalogSections() {
  const [data, setData] = useState<SectionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/marketplace/catalog/sections");
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData((json.data as SectionsData) ?? null);
        }
      } catch {
        /* silent — sections are non-critical */
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 mt-8">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    );
  }

  if (!data) return null;

  const hasFeatured = data.featured.length > 0;
  const hasFlashDeals = data.flashDeals.length > 0;
  const hasTopSellers = data.topSellers.length > 0;
  const hasLiquidations = data.liquidations.length > 0;

  if (!hasFeatured && !hasFlashDeals && !hasTopSellers && !hasLiquidations) {
    return null;
  }

  const gridCols = MARKETPLACE_GRID;

  return (
    <div className="mt-8 space-y-2">
      {/* ── Ofertas Relámpago ── */}
      <Section
        title="Ofertas Relámpago"
        icon={<Zap className="h-4 w-4 text-red-500" />}
        accentColor="bg-red-50 dark:bg-red-950/30"
        isEmpty={!hasFlashDeals}
      >
        <div className={gridCols}>
          {data.flashDeals.map((product, i) => (
            <UnifiedProductCard
              key={product.storeProductId}
              product={toCardProduct(product)}
              variant="flash"
              index={i}
            />
          ))}
        </div>
      </Section>

      {/* ── Top Más Vendidos ── */}
      <Section
        title="Top 3 Más Vendidos"
        icon={<Award className="h-4 w-4 text-amber-500" />}
        accentColor="bg-amber-50 dark:bg-amber-950/30"
        isEmpty={!hasTopSellers}
      >
        <div className={gridCols}>
          {data.topSellers.slice(0, 5).map((product, i) => (
            <UnifiedProductCard
              key={product.storeProductId}
              product={toCardProduct(product)}
              variant="top"
              rank={product.rank ?? i + 1}
              index={i}
            />
          ))}
        </div>
      </Section>

      {/* ── Productos Destacados ── */}
      <Section
        title="Productos Destacados"
        icon={<Star className="h-4 w-4 text-primary" />}
        accentColor="bg-primary/10"
        isEmpty={!hasFeatured}
      >
        <div className={gridCols}>
          {data.featured.map((product, i) => (
            <UnifiedProductCard
              key={product.storeProductId}
              product={toCardProduct(product)}
              variant="default"
              index={i}
            />
          ))}
        </div>
      </Section>

      {/* ── Últimas Unidades ── */}
      <Section
        title="Últimas Unidades"
        icon={<Flame className="h-4 w-4 text-orange-500" />}
        accentColor="bg-orange-50 dark:bg-orange-950/30"
        isEmpty={!hasLiquidations}
      >
        <div className={gridCols}>
          {data.liquidations.map((product, i) => (
            <UnifiedProductCard
              key={product.storeProductId}
              product={toCardProduct(product)}
              variant="liquidation"
              index={i}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
