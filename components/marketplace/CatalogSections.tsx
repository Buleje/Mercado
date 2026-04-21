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
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <>
        <SectionSkeleton kicker="Cargando" title="Ofertas relámpago" />
        <SectionSkeleton kicker="Cargando" title="Top más vendidos" />
      </>
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

  return (
    <>
      {/* ── Ofertas Relámpago ── */}
      {hasFlashDeals && (
        <MarketplaceSection
          id="catalog-flash"
          kicker="Por tiempo limitado"
          title="Ofertas relámpago"
          subtitle="Descuentos que terminan pronto. No te quedes afuera."
        >
          <HorizontalCarousel ariaLabel="Ofertas relámpago">
            {data.flashDeals.map((product, i) => (
              <UnifiedProductCard
                key={product.storeProductId}
                product={toCardProduct(product)}
                variant="flash"
                index={i}
              />
            ))}
          </HorizontalCarousel>
        </MarketplaceSection>
      )}

      {/* ── Top Más Vendidos ── */}
      {hasTopSellers && (
        <MarketplaceSection
          id="catalog-top"
          kicker="Ranking de la semana"
          title="Top más vendidos"
          subtitle="Los productos preferidos por nuestros clientes."
        >
          <HorizontalCarousel ariaLabel="Top más vendidos">
            {data.topSellers.slice(0, 8).map((product, i) => (
              <UnifiedProductCard
                key={product.storeProductId}
                product={toCardProduct(product)}
                variant="top"
                rank={product.rank ?? i + 1}
                index={i}
              />
            ))}
          </HorizontalCarousel>
        </MarketplaceSection>
      )}

      {/* ── Productos Destacados ── */}
      {hasFeatured && (
        <MarketplaceSection
          id="catalog-featured"
          kicker="Recomendados"
          title="Productos destacados"
          subtitle="Selección curada por la tienda."
        >
          <HorizontalCarousel ariaLabel="Productos destacados">
            {data.featured.map((product, i) => (
              <UnifiedProductCard
                key={product.storeProductId}
                product={toCardProduct(product)}
                variant="default"
                index={i}
              />
            ))}
          </HorizontalCarousel>
        </MarketplaceSection>
      )}

      {/* ── Últimas Unidades ── */}
      {hasLiquidations && (
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
                index={i}
              />
            ))}
          </HorizontalCarousel>
        </MarketplaceSection>
      )}
    </>
  );
}
