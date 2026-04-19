"use client";

/**
 * OfertasHero — Hero editorial para /marketplace/ofertas.
 * Kicker + H1 + subtitle + stats + countdown strip.
 * Sin fotos stock. Ilustraciones DS monoline.
 */

import Link from "next/link";
import { Tag, Store, Clock } from "@buleje/design-system/icons";
import {
  BebidasVarias,
  VerduraFresca,
} from "@/components/ui-system/illustrations";
import { useDealsCountdown } from "@/components/marketplace/ofertas/useDealsCountdown";
import type { DealsSummary } from "@/components/marketplace/ofertas/types";

interface OfertasHeroProps {
  summary: DealsSummary;
}

export default function OfertasHero({ summary }: OfertasHeroProps) {
  const { days, hours, minutes } = useDealsCountdown(summary.flashEndsAt);

  return (
    <section
      aria-labelledby="ofertas-hero-heading"
      className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Breadcrumb */}
        <nav aria-label="Navegacion de ruta" className="mb-6">
          <ol className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-gray-400">
            <li>
              <Link href="/marketplace" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Inicio
              </Link>
            </li>
            <li aria-hidden="true" className="text-gray-300 dark:text-gray-600">/</li>
            <li>
              <Link href="/marketplace/explorar" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Explorar
              </Link>
            </li>
            <li aria-hidden="true" className="text-gray-300 dark:text-gray-600">/</li>
            <li className="font-semibold text-gray-600 dark:text-gray-300" aria-current="page">
              Ofertas
            </li>
          </ol>
        </nav>

        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-16">
          {/* Left — texto editorial */}
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
              <Tag className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Ofertas &middot; Esta semana
            </span>
            <h1
              id="ofertas-hero-heading"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.025em] text-gray-900 dark:text-white leading-[1.05]"
            >
              Precios que no te<br />
              <span className="text-gray-400 dark:text-gray-500">podés perder</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-500 dark:text-gray-400 leading-relaxed max-w-xl">
              Descuentos reales en bodegas cerca tuyo. Hoy ahorrás en lo que
              mas usas. Sin trampas, sin letra chica.
            </p>

            {/* Stats strip */}
            <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
              <li className="inline-flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  <strong className="text-gray-900 dark:text-white font-bold">
                    {summary.totalProducts}
                  </strong>{" "}
                  productos en oferta
                </span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  <strong className="text-gray-900 dark:text-white font-bold">
                    {summary.totalStores}
                  </strong>{" "}
                  bodegas participando
                </span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Termina en{" "}
                  <strong className="text-gray-900 dark:text-white font-bold tabular-nums">
                    {String(days).padStart(2, "0")}d{" "}
                    {String(hours).padStart(2, "0")}h{" "}
                    {String(minutes).padStart(2, "0")}m
                  </strong>
                </span>
              </li>
            </ul>
          </div>

          {/* Right — ilustraciones stack */}
          <div
            className="hidden lg:flex items-end gap-4 text-gray-700 dark:text-gray-200 shrink-0"
            aria-hidden="true"
          >
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6">
              <BebidasVarias size={120} strokeWidth={1.4} />
            </div>
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 mb-6">
              <VerduraFresca size={96} strokeWidth={1.4} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
