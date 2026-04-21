"use client";

/**
 * ExplorarCategoriasGrid — grid de categorías con cards más grandes y
 * tipografía legible.
 *
 * Rediseño que hereda estilos del `MarketplaceCardPrimitive` para garantizar
 * coherencia con el resto del marketplace.
 *
 * Mejoras vs versión anterior:
 *  - Grid: 1 / 2 / 3 cols (antes 4 en xl → cards demasiado chicos)
 *  - Título: text-xl sm:text-2xl (antes text-lg)
 *  - Kicker: text-xs font-bold (antes text-[length:var(--ts-2xs)])
 *  - Badge count: h-8 px-3 text-sm (antes px-2.5 py-1 text-[2xs])
 *  - Chips subcategorías: text-xs font-semibold (antes text-[2xs] medium)
 *  - Tiles preview: grid 2x2 con gap más generoso (gap-2 vs gap-1.5)
 *  - CTA: text-sm font-bold (antes text-[xs] semibold)
 *  - Padding: p-6 (antes p-5)
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CATEGORIAS, type CategoriaDef } from "@/lib/constants/marketplace-categories";
import ExplorarSectionHeader from "./ExplorarSectionHeader";
import {
  MarketplaceCard,
  MarketplaceCardMedia,
  MarketplaceCardTitle,
  MarketplaceCardBadge,
} from "./MarketplaceCardPrimitive";

type PreviewProduct = {
  storeProductId: string;
  productId: number;
  name: string;
  image: string | null;
};

type CategoryWithPreview = {
  def: CategoriaDef;
  products: PreviewProduct[];
  total: number;
  loading: boolean;
};

export default function ExplorarCategoriasGrid() {
  const allCategorias = Object.values(CATEGORIAS);
  const [data, setData] = useState<CategoryWithPreview[]>(
    allCategorias.map((def) => ({ def, products: [], total: 0, loading: true })),
  );

  useEffect(() => {
    let cancelled = false;
    const fetchPreview = async (
      def: CategoriaDef,
    ): Promise<{ products: PreviewProduct[]; total: number }> => {
      try {
        const params = new URLSearchParams();
        params.set("category", def.keywords[0] ?? def.slug);
        params.set("limit", "4");
        const res = await fetch(`/api/marketplace/catalog?${params}`, { cache: "no-store" });
        if (!res.ok) return { products: [], total: 0 };
        const json = await res.json();
        const items = (json.items ?? json.data ?? []) as Array<{
          storeProductId: string;
          productId: number;
          name: string;
          image: string | null;
        }>;
        const total =
          typeof json.total === "number"
            ? json.total
            : typeof json.count === "number"
              ? json.count
              : items.length;
        return { products: items.slice(0, 4), total };
      } catch {
        return { products: [], total: 0 };
      }
    };

    Promise.all(
      allCategorias.map(async (def) => {
        const { products, total } = await fetchPreview(def);
        return { def, products, total, loading: false };
      }),
    ).then((results) => {
      if (!cancelled) setData(results);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      id="categorias"
      aria-label="Categorias del marketplace"
      className="w-full py-6 sm:py-8"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <ExplorarSectionHeader
          kicker="Catálogo completo"
          title="Todas las categorías"
          subtitle="Explorá el marketplace por categoría."
          ctaLabel="Ver catálogo completo"
          ctaHref="/marketplace?vista=catalogo"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.map(({ def, products, total, loading }) => (
            <CategoriaCard
              key={def.slug}
              def={def}
              products={products}
              total={total}
              loading={loading}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface CategoriaCardProps {
  def: CategoriaDef;
  products: PreviewProduct[];
  total: number;
  loading: boolean;
}

function CategoriaCard({ def, products, total, loading }: CategoriaCardProps) {
  const [hovered, setHovered] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!hovered || products.length <= 1) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % products.length);
    }, 1200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hovered, products.length]);

  const tiles = loading
    ? Array.from({ length: 4 }, () => null)
    : [...products, null, null, null, null].slice(0, 4);

  return (
    <Link
      href={`/marketplace/categoria/${def.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setActiveIdx(0);
      }}
      className="block"
    >
      <MarketplaceCard tone="raised" size="md" interactive className="h-full">
        {/* Preview tiles grid 2x2 primero (visual > texto) */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {tiles.map((p, i) => {
            const showProduct = hovered && products[activeIdx] ? products[activeIdx] : p;
            return (
              <MarketplaceCardMedia
                key={`${def.slug}-tile-${i}`}
                aspectRatio="1/1"
                rounded={true}
              >
                {loading ? (
                  <div className="h-full w-full skeleton-shimmer" />
                ) : showProduct?.image ? (
                  <Image
                    key={`${i}-${showProduct.storeProductId}`}
                    src={showProduct.image}
                    alt={showProduct.name}
                    fill
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 180px"
                    className={cn(
                      "object-cover transition-all duration-500 ease-out",
                      "motion-reduce:transition-none",
                      hovered ? "scale-105" : "scale-100",
                    )}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                    <Package className="h-6 w-6" strokeWidth={1.25} aria-hidden />
                  </div>
                )}
              </MarketplaceCardMedia>
            );
          })}
        </div>

        {/* Header: título + count inline */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <MarketplaceCardTitle size="md" clamp={1}>
            {def.label}
          </MarketplaceCardTitle>
          {!loading && total > 0 && (
            <MarketplaceCardBadge tone="neutral" className="text-[11px] px-2 py-0.5 shrink-0">
              {total >= 99 ? "99+" : total}
            </MarketplaceCardBadge>
          )}
        </div>

        {/* CTA compacto */}
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] group-hover/card:gap-2 transition-all">
          Ver todo
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </span>
      </MarketplaceCard>
    </Link>
  );
}
