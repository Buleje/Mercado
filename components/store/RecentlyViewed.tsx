"use client";

/**
 * RecentlyViewed — Sección "Vuelve a ver" con historial local.
 *
 * Lee de localStorage via useRecentViewed (key: marketplace:recent-viewed:v1).
 * Si el array está vacío, retorna null sin renderizar nada.
 * Horizontal scroll snap-x. Mobile-first.
 *
 * Props:
 *   maxItems?: number = 6 — cuántos items mostrar (por defecto 6 de max 12)
 */

import Link from "next/link";
import { ChevronRight, Clock, X } from "@buleje/design-system/icons";
import { useRecentViewed } from "@/hooks/use-recent-viewed";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
} from "@/components/ui-system/illustrations";

// Ilustraciones de fallback rotativas (sin fotos stock)
const FALLBACK_ILLUSTRATIONS = [
  LacteosRefresh,
  VerduraFresca,
  BebidasVarias,
  LimpiezaDomicilio,
  CarniceriaFresca,
];

interface RecentlyViewedProps {
  maxItems?: number;
}

export default function RecentlyViewed({ maxItems = 6 }: RecentlyViewedProps) {
  const { items, clear } = useRecentViewed();

  if (items.length === 0) return null;

  const visible = items.slice(0, maxItems);

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
            <Clock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Vuelve a ver
          </span>
          <h2
            id="recently-viewed-heading"
            className="text-2xl sm:text-3xl font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] dark:text-white"
          >
            Productos que miraste
          </h2>
        </div>

        <button
          type="button"
          onClick={clear}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-gray-200 transition-colors"
          aria-label="Limpiar historial de productos vistos"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Limpiar
        </button>
      </div>

      {/* Horizontal scroll con snap-x */}
      <div
        className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none"
        role="list"
        aria-label="Productos vistos recientemente"
      >
        <div className="flex gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory">
          {visible.map((item, idx) => {
            const Ill = FALLBACK_ILLUSTRATIONS[idx % FALLBACK_ILLUSTRATIONS.length];
            const href = `/marketplace/${item.storeSlug}?p=${item.productId}`;

            return (
              <div
                key={`${item.storeSlug}-${item.productId}`}
                role="listitem"
                className="snap-start shrink-0 w-44 sm:w-48"
              >
                <Link
                  href={href}
                  className="group block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
                  aria-label={`Volver a ver ${item.name}`}
                >
                  {/* Thumbnail con ilustracion fallback */}
                  <div className="aspect-square bg-gray-50 dark:bg-gray-950 flex items-center justify-center text-[var(--text-primary)] dark:text-gray-200 group-hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-800">
                    <Ill size={72} strokeWidth={1.5} />
                  </div>

                  <div className="p-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-white leading-tight line-clamp-2">
                      {item.name}
                    </p>
                    <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-gray-400 line-clamp-1">
                      {item.storeName}
                    </p>
                    <p className="mt-1.5 text-base font-extrabold text-[var(--text-primary)] dark:text-white">
                      S/{(Number(item.price) || 0).toFixed(2)}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-primary">
                      Volver a ver
                      <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}

          {/* CTA — fin del scroll */}
          <div className="snap-start shrink-0 w-44 sm:w-48 flex items-center">
            <Link
              href="/marketplace/mi-cuenta/historial"
              className="group flex flex-col items-center justify-center gap-2 w-full aspect-square rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary dark:hover:border-primary hover:bg-primary/5 transition-all text-center px-4"
            >
              <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-gray-400 group-hover:text-primary transition-colors leading-snug">
                Ver historial completo
              </span>
              <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-primary transition-colors" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
