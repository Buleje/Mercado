"use client";

/**
 * DealsGrid — Grilla de ofertas reales con UnifiedProductCard.
 *
 * Mismo formato de tarjeta que el marketplace: imagen, badge de descuento,
 * precio + tachado, botón añadir al carrito (que abre modal de detalles
 * cuando aplica). Layout responsive: 2 → 3 → 4 → 5 columnas.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Deal } from "@/lib/mock-deals";
import ExplorarSectionHeader from "@/components/marketplace/explorar/ExplorarSectionHeader";
import UnifiedProductCard, {
  type UnifiedProductCardProduct,
} from "@/components/marketplace/UnifiedProductCard";

const PAGE_SIZE = 20;

function dealToCard(d: Deal): UnifiedProductCardProduct {
  return {
    id: d.productId ?? (Number(d.id.slice(-8).replace(/\D/g, "0")) || 0),
    name: d.name,
    price: d.price,
    originalPrice: d.previousPrice > d.price ? d.previousPrice : undefined,
    image: d.image ?? null,
    storeName: d.storeName,
    storeSlug: d.storeSlug,
    storeLogo: d.storeLogo,
    storeProductId: d.storeProductId,
    unit: d.unit,
    category: d.category,
    stock: d.stock ?? 0,
    discount: d.discountPct,
  };
}

interface DealsGridProps {
  deals: Deal[];
}

export default function DealsGrid({ deals }: DealsGridProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(deals.length / PAGE_SIZE));
  const paginated = deals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (deals.length === 0) {
    return (
      <section
        aria-label="Sin resultados"
        className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-soft)] text-[var(--text-tertiary)] mb-4">
            <Package className="h-9 w-9" strokeWidth={1.25} aria-hidden />
          </div>
          <p className="text-lg font-black tracking-tight text-[var(--text-primary)]">
            Sin ofertas con esos filtros
          </p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)] max-w-sm leading-relaxed">
            Probá cambiando la categoría o el rango de descuento. Las bodegas suben ofertas todos los días.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="deals-grid-heading"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8"
    >
      <ExplorarSectionHeader
        kicker="Catálogo de ofertas"
        title="Todas las ofertas"
        subtitle={`${deals.length} ${deals.length === 1 ? "producto con descuento" : "productos con descuento"}. Filtrá por categoría o rebaja mínima arriba.`}
      />

      <div
        className={cn(
          "grid gap-3 sm:gap-4",
          "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
        )}
      >
        {paginated.map((deal, i) => (
          <UnifiedProductCard
            key={deal.id}
            product={dealToCard(deal)}
            variant={deal.isFlash ? "flash" : "default"}
            index={i}
            endsAt={deal.isFlash ? new Date(deal.endsAt) : undefined}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Página anterior"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg",
              "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
              "hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
              "disabled:opacity-40 disabled:pointer-events-none transition-colors",
            )}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-label={`Página ${n}`}
              aria-current={page === n ? "page" : undefined}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold tabular-nums transition-colors",
                page === n
                  ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                  : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
              )}
            >
              {n}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Página siguiente"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg",
              "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
              "hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
              "disabled:opacity-40 disabled:pointer-events-none transition-colors",
            )}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
