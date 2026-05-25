"use client";

/**
 * CatalogSections — 4 secciones del catalogo de tienda:
 *   1. Ofertas Relámpago (variant="flash")
 *   2. Top Mas Vendidos    (variant="top")
 *   3. Productos Destacados (variant="default")
 *   4. Ultimas Unidades    (variant="liquidation")
 *
 * Estandarizado 2026-04-20: usa MarketplaceSection (mismo wrapper que el resto
 * del marketplace) + HorizontalCarousel (single row + drag + barra mini).
 *
 * Antes: cada seccion tenia su propio Section local con icon coloreado y
 * gridCols. Inconsistente con el resto del home. Migrado al patron canonico.
 */

import { useState, useEffect } from "react";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

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

/* ── Skeleton ──────────────────────────────────────────────────────────────── */

function SectionSkeleton({ kicker, title }: { kicker: string; title: string }) {
  return (
    <MarketplaceSection kicker={kicker} title={title}>
      <HorizontalCarousel ariaLabel={`Cargando ${title}`} showNav={false}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl skeleton-shimmer" />
        ))}
      </HorizontalCarousel>
    </MarketplaceSection>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export default function CatalogSections() {
  const [data, setData] = useState<SectionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Hard timeout — when the sections endpoint hangs, stop loading and
    // fall through to the no-data branch so the skeleton doesn't spin forever.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 10_000);

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
      if (!cancelled) {
        setLoading(false);
        clearTimeout(timeoutId);
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  if (loading) {
    return <SectionSkeleton kicker="Cargando" title="Últimas unidades" />;
  }

  if (!data) return null;

  // De-dup (2026-05-24): flash / top / featured ya tienen secciones dedicadas
  // en la home (OfertasFlashSection, MarketplaceBestsellersStrip,
  // OfertasDelDiaHero). CatalogSections renderiza SOLO "Últimas unidades"
  // (liquidations), que no tiene sección propia, para no repetir títulos.
  const hasLiquidations = data.liquidations.length > 0;
  if (!hasLiquidations) return null;

  return (
    <MarketplaceSection
      id="catalog-liquidations"
      kicker="Stock final"
      title="Últimas unidades"
      subtitle="Quedan pocas. Llevatelas antes que se agoten."
    >
      <HorizontalCarousel ariaLabel="Últimas unidades">
        {data.liquidations.map((product, i) => (
          <UnifiedProductCard
            key={product.storeProductId}
            product={toCardProduct(product)}
            variant="liquidation"
            layout="compact"
            index={i}
          />
        ))}
      </HorizontalCarousel>
    </MarketplaceSection>
  );
}
