"use client";

/**
 * DealsGrid — Grid responsive de cards de deals con badges + paginacion.
 *
 * Estilo Buleje: tokens estrictos, badges accent solido para descuento,
 * precio XL black + tachado original + ahorro pill, hover translate-y.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Package, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Deal } from "@/lib/mock-deals";
import { useDealsCountdown } from "./useDealsCountdown";
import ExplorarSectionHeader from "@/components/marketplace/explorar/ExplorarSectionHeader";

const PAGE_SIZE = 12;

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function DealTimeLabel({ endsAt }: { endsAt: string }) {
  const { days, hours, minutes, expired } = useDealsCountdown(endsAt);
  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        Vencida
      </span>
    );
  }
  if (days > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">
        <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        Termina en {days}d {hours}h
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent)] uppercase tracking-wider">
      <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
      {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")} restantes
    </span>
  );
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
            Proba cambiando la categoria o el rango de descuento. Volve pronto — todos los dias hay ofertas nuevas.
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
        kicker="Catalogo de ofertas"
        title="Todas las ofertas"
        subtitle={`${deals.length} ${deals.length === 1 ? "producto con descuento" : "productos con descuento"}. Filtra por categoria o rebaja minima arriba.`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {paginated.map((deal) => {
          const ahorro = deal.previousPrice - deal.price;
          return (
            <Link
              key={deal.id}
              href={`/marketplace/${deal.storeSlug}`}
              className="group relative block rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5 transition-all duration-300 motion-reduce:hover:translate-y-0"
            >
              {/* Badge descuento — accent solido */}
              <span className="absolute top-2 left-2 z-10 inline-flex items-center justify-center rounded-md px-2 py-1 text-[length:var(--ts-xs)] font-black tabular-nums uppercase tracking-wider bg-[var(--accent)] text-[var(--surface-canvas)] shadow-md">
                -{deal.discountPct}%
              </span>

              {/* Flash badge (top-right) — solo para deals con isFlash */}
              {deal.isFlash && (
                <span className="absolute top-2 right-2 z-10 inline-flex items-center px-2 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider bg-[var(--text-primary)] text-[var(--surface-canvas)]">
                  Flash
                </span>
              )}

              {/* Placeholder imagen */}
              <div className="relative aspect-square bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)]">
                <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                  <Package className="h-10 w-10" strokeWidth={1.25} aria-hidden />
                </span>
              </div>

              {/* Info */}
              <div className="p-3 sm:p-4">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {deal.category}
                </p>
                <h3 className="mt-0.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                  {deal.name}
                </h3>
                <p className="mt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] line-clamp-1">
                  {deal.storeName} &middot; {deal.unit}
                </p>
                <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
                    {pen.format(deal.previousPrice)}
                  </span>
                  <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent)]">
                    Ahorra {pen.format(ahorro)}
                  </span>
                </div>
                <p className="mt-0.5 text-xl font-black tabular-nums tracking-[-0.02em] text-[var(--accent)] leading-none">
                  {pen.format(deal.price)}
                </p>
                <div className="mt-2 pt-2 border-t border-[var(--rule-soft)]">
                  <DealTimeLabel endsAt={deal.endsAt} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Paginacion — botones tokenizados */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Pagina anterior"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg",
              "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
              "hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
              "disabled:opacity-40 disabled:pointer-events-none",
              "transition-colors",
            )}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-label={`Pagina ${n}`}
              aria-current={page === n ? "page" : undefined}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold transition-colors tabular-nums",
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
            aria-label="Pagina siguiente"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg",
              "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
              "hover:bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
              "disabled:opacity-40 disabled:pointer-events-none",
              "transition-colors",
            )}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
