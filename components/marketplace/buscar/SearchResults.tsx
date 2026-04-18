"use client";

/**
 * SearchResults — Grid de productos con paginacion informativa.
 *
 * Reutiliza el patron de ProductTile de CategoryProductGrid pero adaptado
 * a la vista de busqueda (sin una CategoriaDef especifica, usa BodegaAbriendo
 * como fallback universal para todos los productos sin imagen).
 *
 * Grid: 1 col narrow / 2 mobile / 3 tablet / 4 desktop.
 */

import Link from "next/link";
import Image from "next/image";
import { Star, Plus, MapPin } from "lucide-react";
import { ProductPrice, ProductBadge } from "@buleje/design-system";
import { BodegaAbriendo } from "@/components/ui-system/illustrations";
import type { SearchProduct } from "@/lib/db/marketplace-search.db";

interface SearchResultsProps {
  products: SearchProduct[];
  total: number;
  page: number;
  limit: number;
  query: string;
  isPending: boolean;
}

function ProductTile({ product }: { product: SearchProduct }) {
  const href = `/marketplace/${product.storeSlug}/producto/${product.productId}`;
  const outOfStock = (product.stock ?? 0) === 0 && product.stock !== null;

  return (
    <article
      className="group relative flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
      aria-label={product.name}
    >
      <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
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
              <BodegaAbriendo size={96} strokeWidth={1.5} />
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
        {/* Tienda + zona */}
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 line-clamp-1">
          {product.storeName}
          {product.storeZone && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 normal-case tracking-normal text-gray-400 dark:text-gray-500">
              <MapPin className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
              {product.storeZone}
            </span>
          )}
        </span>

        {/* Nombre */}
        <Link href={href} className="min-h-[2.5rem]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Rating */}
        {product.storeRating > 0 && (
          <div className="flex items-center gap-1" aria-label={`Calificacion: ${product.storeRating.toFixed(1)} de 5`}>
            <div className="flex items-center gap-px" aria-hidden="true">
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

        {/* Precio + CTA */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <ProductPrice price={product.price} unit={product.unit} size="md" />

          <Link
            href={href}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={`Ver ${product.name}`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function SearchResults({
  products,
  total,
  page,
  limit,
  query,
  isPending,
}: SearchResultsProps) {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const totalPages = Math.ceil(total / limit);

  return (
    <div
      className={`transition-opacity duration-200 ${isPending ? "opacity-50 pointer-events-none" : "opacity-100"}`}
      aria-busy={isPending}
    >
      {/* Strip de conteo */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Mostrando{" "}
          <span className="text-gray-900 dark:text-white font-semibold">
            {from}–{to}
          </span>{" "}
          de{" "}
          <span className="text-gray-900 dark:text-white font-semibold">
            {total.toLocaleString("es-PE")}
          </span>{" "}
          resultado{total === 1 ? "" : "s"}
          {query && (
            <>
              {" "}
              para{" "}
              <span className="text-gray-900 dark:text-white font-semibold">
                &ldquo;{query}&rdquo;
              </span>
            </>
          )}
        </p>
      </div>

      {/* Grid de productos */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5"
        aria-label={`Resultados de busqueda: ${total} productos`}
      >
        {products.map((p) => (
          <ProductTile key={p.storeProductId} product={p} />
        ))}
      </div>

      {/* Paginacion */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacion de resultados"
          className="mt-10 flex items-center justify-center gap-2"
        >
          {page > 1 && (
            <Link
              href={buildPageUrl(query, page - 1)}
              className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Anterior
            </Link>
          )}

          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 px-4">
            Pagina{" "}
            <span className="text-gray-900 dark:text-white font-semibold">
              {page}
            </span>{" "}
            de{" "}
            <span className="text-gray-900 dark:text-white font-semibold">
              {totalPages}
            </span>
          </span>

          {page < totalPages && (
            <Link
              href={buildPageUrl(query, page + 1)}
              className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function buildPageUrl(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `/marketplace/buscar?${params.toString()}`;
}
