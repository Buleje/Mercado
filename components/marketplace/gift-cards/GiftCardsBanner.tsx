"use client";

import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import GiftCardArtwork from "./shared/GiftCardArtwork";

/**
 * GiftCardsBanner
 * CTA promocional compacto — pensado para la home del marketplace.
 * Una sola fila con ilustracion + copy + boton.
 */
export default function GiftCardsBanner() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/marketplace/gift-cards"
        className="group flex items-center gap-5 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-400 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
      >
        <div className="hidden h-20 w-32 shrink-0 overflow-hidden rounded-xl sm:block">
          <GiftCardArtwork design="cumpleanos" className="h-full w-full" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            Nuevo
          </div>
          <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
            Regala una Gift Card Buleje
          </h3>
          <p className="mt-0.5 line-clamp-1 text-sm text-gray-600 dark:text-gray-400">
            Desde S/ 20 · Envio instantaneo por WhatsApp o email
          </p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:group-hover:bg-gray-100">
          Ver tarjetas
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
    </section>
  );
}
