"use client";

/**
 * DealsByStore — Sección "Ofertas por bodega".
 * Grid horizontal 4-6 store cards con ilustracion + deals count + CTA.
 */

import Link from "next/link";
import { ChevronRight, MapPin, Tag } from "@buleje/design-system/icons";
import type { DealStore } from "@/lib/mock-deals";
import {
  BodegaAbriendo,
  DoniaElena,
  BodegueroCelebrando,
  MalocaAtardecer,
  MotorizadoUcayali,
  CuadernoFiadoReal,
} from "@/components/ui-system/illustrations";
import type { ComponentType, SVGAttributes } from "react";

type IllComp = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
} & SVGAttributes<SVGSVGElement>>;

const STORE_ILLUSTRATIONS: IllComp[] = [
  DoniaElena,
  BodegaAbriendo,
  BodegueroCelebrando,
  MalocaAtardecer,
  MotorizadoUcayali,
  CuadernoFiadoReal,
];

interface DealsByStoreProps {
  stores: DealStore[];
}

export default function DealsByStore({ stores }: DealsByStoreProps) {
  return (
    <section
      aria-labelledby="deals-by-store-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">
          Por tienda
        </span>
        <h2
          id="deals-by-store-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white"
        >
          Ofertas por bodega
        </h2>
      </header>

      {/* Scroll horizontal mobile / grid desktop */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto sm:overflow-visible scrollbar-none">
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory sm:snap-none">
          {stores.map((store, i) => {
            const Ill = STORE_ILLUSTRATIONS[i % STORE_ILLUSTRATIONS.length];
            return (
              <article
                key={store.id}
                className="group snap-start shrink-0 w-56 sm:w-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
              >
                {/* Ilustracion */}
                <div className="aspect-[4/3] bg-gray-50 dark:bg-gray-950 flex items-center justify-center text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-800">
                  <Ill size={88} strokeWidth={1.5} />
                </div>

                <div className="p-4">
                  <h3 className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white line-clamp-1">
                    {store.name}
                  </h3>
                  <p className="mt-1 flex items-center gap-1 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
                    <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    {store.zone}
                  </p>

                  {/* Stats */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                      <Tag className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
                      {store.activeDeals} ofertas
                    </span>
                    <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-500">
                      Hasta -{store.maxDiscountPct}%
                    </span>
                  </div>

                  <Link
                    href={`/marketplace/${store.slug}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Ver ofertas
                    <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
