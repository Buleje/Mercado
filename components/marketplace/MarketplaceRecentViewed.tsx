"use client";

/**
 * MarketplaceRecentViewed — Carousel horizontal de productos vistos
 * recientemente (persistidos en localStorage via useRecentViewed).
 *
 * Ola 7: migrado al primitivo ProductCardCompact del DS. Antes usaba un
 * tile local con Link + Image inline; ahora consume el primitivo canonico
 * para consistencia visual con Para vos / Comparados / Top hoy.
 */

import Image from "next/image";
import {
  ProductCardCompact,
  type ProductCardProduct,
} from "@buleje/design-system";
import { Clock, X } from "@buleje/design-system/icons";
import { useRecentViewed } from "@/hooks/use-recent-viewed";

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
      sizes="(max-width: 640px) 40vw, 180px"
    />
  );
}

export default function MarketplaceRecentViewed() {
  const { items, clear } = useRecentViewed();

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Productos vistos recientemente"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Seguiste viendo
          </h3>
        </div>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      </div>

      {/* ProductCardCompact (Ola 7) — carousel horizontal recent viewed */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory">
        {items.map((it) => {
          const product: ProductCardProduct = {
            id: it.productId,
            name: it.name,
            price: it.price,
            image: it.image ?? null,
            storeSlug: it.storeSlug,
            storeName: it.storeName,
            href: `/marketplace/${it.storeSlug}?p=${it.productId}`,
          };
          return (
            <div
              key={`${it.storeSlug}-${it.productId}`}
              className="shrink-0 snap-start"
            >
              <ProductCardCompact
                product={product}
                renderImage={it.image ? nextImage : undefined}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
