"use client";

/**
 * DealsByStore — Carrusel horizontal de bodegas con deals activos.
 *
 * Estilo Buleje: ExplorarSectionHeader + HorizontalCarousel + cards Holded
 * con avatar bodega (letra inicial) + zona + stats (deals count + max %).
 *
 * Tokens estrictos. Sin colores hardcoded. Iconos del DS Buleje.
 */

import Link from "next/link";
import { ArrowRight, MapPin, Tag, Store as StoreIcon } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import ExplorarSectionHeader from "@/components/marketplace/explorar/ExplorarSectionHeader";
import type { DealStore } from "@/lib/mock-deals";

interface DealsByStoreProps {
  stores: DealStore[];
}

export default function DealsByStore({ stores }: DealsByStoreProps) {
  if (stores.length === 0) return null;

  return (
    <section
      aria-labelledby="deals-by-store-heading"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14"
    >
      <ExplorarSectionHeader
        kicker="Bodegas en oferta"
        title="Las que mas rebajan esta semana"
        subtitle={`${stores.length} bodegas con descuentos activos. Cliquea cualquiera para ver su catalogo en oferta.`}
        ctaLabel="Ver todas las bodegas"
        ctaHref="/tiendas"
      />

      <HorizontalCarousel
        ariaLabel="Bodegas con ofertas activas"
        itemWidthClass="w-[280px] sm:w-[320px] shrink-0 snap-start"
      >
        {stores.map((store) => {
          const initial = store.name.trim().charAt(0).toUpperCase() || "B";
          return (
            <Link
              key={store.id}
              href={`/marketplace/${store.slug}`}
              className="group block rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5 transition-all duration-300 motion-reduce:hover:translate-y-0"
            >
              {/* Top bloque: avatar + name + zona */}
              <div className="p-5 flex items-start gap-4 border-b border-[var(--rule-soft)]">
                <span
                  aria-hidden
                  className="inline-flex h-14 w-14 items-center justify-center rounded-xl shrink-0 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-2xl font-black tracking-tight"
                >
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                    {store.name}
                  </h3>
                  <p className="mt-1 inline-flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                    {store.zone}
                  </p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 divide-x divide-[var(--rule-soft)]">
                <div className="p-3 flex flex-col items-center text-center">
                  <Tag className="h-3.5 w-3.5 text-[var(--text-tertiary)] mb-1" strokeWidth={1.75} aria-hidden />
                  <p className="text-[length:var(--ts-base)] font-black tabular-nums text-[var(--text-primary)] leading-none">
                    {store.activeDeals}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                    Ofertas
                  </p>
                </div>
                <div className="p-3 flex flex-col items-center text-center">
                  <StoreIcon className="h-3.5 w-3.5 text-[var(--text-tertiary)] mb-1" strokeWidth={1.75} aria-hidden />
                  <p className="text-[length:var(--ts-base)] font-black tabular-nums text-[var(--accent)] leading-none">
                    -{store.maxDiscountPct}%
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                    Máximo
                  </p>
                </div>
                <div className="p-3 flex flex-col items-center text-center">
                  <Tag className="h-3.5 w-3.5 text-[var(--text-tertiary)] mb-1" strokeWidth={1.75} aria-hidden />
                  <p className="text-[length:var(--ts-base)] font-black tabular-nums text-[var(--text-primary)] leading-none">
                    -{store.avgDiscountPct}%
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                    Promedio
                  </p>
                </div>
              </div>

              {/* CTA pill */}
              <div className="p-3 border-t border-[var(--rule-soft)]">
                <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] group-hover:gap-2 transition-all">
                  Ver ofertas de esta bodega
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </span>
              </div>
            </Link>
          );
        })}
      </HorizontalCarousel>
    </section>
  );
}
