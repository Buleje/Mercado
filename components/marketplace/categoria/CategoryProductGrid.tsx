"use client";

/**
 * CategoryProductGrid — grid de productos de la categoria.
 *
 * Cards minimalistas (Buleje/Holded):
 *   - Tile con ilustracion fallback por categoria (DS monoline)
 *   - Nombre producto, tienda, rating, precio, CTA primary
 *   - Hover: border tint + subtle shadow
 *
 * Grid responsivo: 1 col narrow / 2 col mobile / 3 col tablet / 4 col desktop.
 *
 * Cuando no hay resultados: EmptyState con CanastaVacia + CTA reset.
 */

import Link from "next/link";
import Image from "next/image";
import { Star, Plus, MapPin } from "lucide-react";
import { ProductPrice, ProductBadge } from "@buleje/design-system";
import type {
  CatalogProduct,
  CategoriaDef,
} from "@/lib/db/marketplace-catalog.db";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
  BodegaAbriendo,
  CorazonLatiendo,
  CanastaVacia,
  PaicheEnOlla,
} from "@/components/ui-system/illustrations";

const FALLBACK_MAP = {
  LimpiezaDomicilio,
  BodegaAbriendo,
  CarniceriaFresca,
  VerduraFresca,
  BebidasVarias,
  LacteosRefresh,
  CorazonLatiendo,
  PaicheEnOlla,
} as const;

interface CategoryProductGridProps {
  products: CatalogProduct[];
  categoria: CategoriaDef;
}

function ProductTile({
  product,
  fallbackIllustration: Illustration,
}: {
  product: CatalogProduct;
  fallbackIllustration: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
}) {
  // Rutas canonicas del marketplace: [slug]/producto/[productId]
  const href = `/marketplace/${product.storeSlug}/producto/${product.productId}`;
  const outOfStock = (product.stock ?? 0) === 0 && product.stock !== null;

  return (
    <article
      className="group relative flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
      aria-label={product.name}
    >
      <Link href={href} className="block">
        <div className="relative aspect-square bg-gray-50 dark:bg-gray-950 flex items-center justify-center overflow-hidden">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              unoptimized={product.image.startsWith("data:")}
            />
          ) : (
            <div className="text-gray-500 dark:text-gray-400 opacity-70 group-hover:opacity-90 transition-opacity">
              <Illustration size={100} strokeWidth={1.5} />
            </div>
          )}

          {outOfStock && (
            <div className="absolute top-2 right-2">
              <ProductBadge intent="scarcity">Agotado</ProductBadge>
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-1.5 p-3 sm:p-4 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 line-clamp-1">
          {product.storeName}
          {product.storeZone && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 normal-case tracking-normal text-gray-400">
              <MapPin className="h-3 w-3" strokeWidth={1.5} />
              {product.storeZone}
            </span>
          )}
        </span>

        <Link href={href} className="min-h-[2.5rem]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>

        {product.storeRating > 0 && (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-px">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-3 w-3 ${
                    s <= Math.round(product.storeRating)
                      ? "text-gray-900 dark:text-white fill-current"
                      : "text-gray-300 dark:text-gray-700"
                  }`}
                  strokeWidth={1.5}
                />
              ))}
            </div>
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
              {product.storeRating.toFixed(1)}
            </span>
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <ProductPrice price={product.price} unit={product.unit} size="md" />

          <Link
            href={href}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors"
            aria-label={`Ver ${product.name}`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ categoria }: { categoria: CategoriaDef }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
      <div className="text-gray-400 dark:text-gray-600 mb-6">
        <CanastaVacia size={140} strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
        Sin productos en {categoria.label}
      </h3>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        Prueba quitando algun filtro o cambia a otra sub-categoria. Las
        bodegas suben productos nuevos todos los dias.
      </p>
      <Link
        href="/marketplace/explorar"
        className="mt-6 inline-flex items-center rounded-full bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors"
      >
        Volver a explorar
      </Link>
    </div>
  );
}

export default function CategoryProductGrid({
  products,
  categoria,
}: CategoryProductGridProps) {
  const Fallback = FALLBACK_MAP[categoria.illustration];

  if (products.length === 0) {
    return <EmptyState categoria={categoria} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
      {products.map((p) => (
        <ProductTile
          key={p.storeProductId}
          product={p}
          fallbackIllustration={Fallback}
        />
      ))}
    </div>
  );
}
