"use client";

/**
 * SearchResults — Grid de productos con paginacion informativa.
 *
 * Ola 7: migrado al primitivo ProductCardGrid del DS. Antes usaba un
 * ProductTile local duplicado de CategoryProductGrid; ahora ambos consumen
 * el mismo primitivo canonico. Grid 2 col mobile / 3 tablet / 4 desktop / 5 xl.
 */

import Link from "next/link";
import Image from "next/image";
import { ProductCardGrid } from "@buleje/design-system";
import { toProductCardShape } from "@/lib/marketplace/product-adapter";
import type { SearchProduct } from "@/lib/db/marketplace-search.db";

interface SearchResultsProps {
  products: SearchProduct[];
  total: number;
  page: number;
  limit: number;
  query: string;
  isPending: boolean;
}

// Renderer Next/Image inyectado al primitivo del DS para optimizacion.
function nextImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
      unoptimized={src.startsWith("data:")}
    />
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
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Mostrando{" "}
          <span className="text-[var(--text-primary)] font-semibold">
            {from}–{to}
          </span>{" "}
          de{" "}
          <span className="text-[var(--text-primary)] font-semibold">
            {total.toLocaleString("es-PE")}
          </span>{" "}
          resultado{total === 1 ? "" : "s"}
          {query && (
            <>
              {" "}
              para{" "}
              <span className="text-[var(--text-primary)] font-semibold">
                &ldquo;{query}&rdquo;
              </span>
            </>
          )}
        </p>
      </div>

      {/* ProductCardGrid (Ola 7) — grid catalogo principal de busqueda */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
        aria-label={`Resultados de busqueda: ${total} productos`}
      >
        {products.map((p) => (
          <ProductCardGrid
            key={p.storeProductId}
            product={toProductCardShape({
              ...p,
              href: `/marketplace/${p.storeSlug}/producto/${p.productId}`,
            })}
            renderImage={p.image ? nextImage : undefined}
          />
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
              className="inline-flex items-center rounded-xl border-2 border-[var(--rule-base)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] hover:border-[var(--rule-strong)] transition-colors"
            >
              Anterior
            </Link>
          )}

          <span className="text-sm font-medium text-[var(--text-secondary)] px-4">
            Pagina{" "}
            <span className="text-[var(--text-primary)] font-semibold">
              {page}
            </span>{" "}
            de{" "}
            <span className="text-[var(--text-primary)] font-semibold">
              {totalPages}
            </span>
          </span>

          {page < totalPages && (
            <Link
              href={buildPageUrl(query, page + 1)}
              className="inline-flex items-center rounded-xl border-2 border-[var(--rule-base)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] hover:border-[var(--rule-strong)] transition-colors"
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
