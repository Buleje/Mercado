"use client";

/**
 * DealsGrid — Grid 4 cols de ProductCards con badge "-X%" teal soft.
 * Pagination simple (client-side). No requiere backend.
 */

import { useState } from "react";
import Link from "next/link";
import { Clock, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import type { Deal } from "@/lib/mock-deals";
import { useDealsCountdown } from "./useDealsCountdown";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
  PaicheEnOlla,
  FrascoEstrellas,
} from "@/components/ui-system/illustrations";
import type { ComponentType, SVGAttributes } from "react";

type IllComp = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
} & SVGAttributes<SVGSVGElement>>;

const CAT_ILL: Record<string, IllComp> = {
  abarrotes: LacteosRefresh,
  frescos: VerduraFresca,
  bebidas: BebidasVarias,
  limpieza: LimpiezaDomicilio,
  lacteos: LacteosRefresh,
  farmacia: PaicheEnOlla,
  carnes: CarniceriaFresca,
};

const PAGE_SIZE = 12;

function DealTimeLabel({ endsAt }: { endsAt: string }) {
  const { days, hours, minutes, expired } = useDealsCountdown(endsAt);
  if (expired) return <span className="text-[length:var(--ts-2xs)] text-gray-400">Vencida</span>;
  if (days > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
        <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
        Termina en {days}d {hours}h
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-amber-600 dark:text-amber-400 font-semibold">
      <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
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
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-[var(--text-secondary)] mb-4" aria-hidden="true">
            <FrascoEstrellas size={160} />
          </div>
          <p className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
            Sin ofertas con esos filtros
          </p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)] max-w-sm leading-relaxed">
            Probá cambiando la categoría o el rango de descuento. Volvé pronto
            — todos los días hay ofertas nuevas.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="deals-grid-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id="deals-grid-heading" className="sr-only">
          Todas las ofertas
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-white">{deals.length}</span>{" "}
          {deals.length === 1 ? "oferta" : "ofertas"}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {paginated.map((deal) => {
          const Ill = CAT_ILL[deal.category] ?? LacteosRefresh;
          return (
            <Link
              key={deal.id}
              href={`/marketplace/${deal.storeSlug}`}
              className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
            >
              {/* Badge descuento */}
              <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-primary/10 text-primary border border-primary/20">
                -{deal.discountPct}%
              </span>

              {/* Flash badge */}
              {deal.isFlash && (
                <span className="absolute top-2 right-2 z-10 inline-flex items-center px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                  Flash
                </span>
              )}

              {/* Ilustracion */}
              <div className="aspect-square bg-gray-50 dark:bg-gray-950 flex items-center justify-center text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-800">
                <Ill size={80} strokeWidth={1.5} />
              </div>

              <div className="p-3 sm:p-4">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-gray-400">
                  {deal.category}
                </span>
                <h3 className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">
                  {deal.name}
                </h3>
                <p className="mt-0.5 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 line-clamp-1">
                  {deal.storeName} &middot; {deal.unit}
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-base font-extrabold text-gray-900 dark:text-white">
                    S/{deal.price.toFixed(2)}
                  </span>
                  <span className="text-[length:var(--ts-2xs)] text-gray-400 line-through">
                    S/{deal.previousPrice.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <DealTimeLabel endsAt={deal.endsAt} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Pagina anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              aria-label={`Pagina ${n}`}
              aria-current={page === n ? "page" : undefined}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                page === n
                  ? "bg-primary text-white"
                  : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
              }`}
            >
              {n}
            </button>
          ))}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Pagina siguiente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
