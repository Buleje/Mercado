"use client";

/**
 * RecommendationsStrip — Horizontal scroll de tiendas destacadas cerca.
 * Cards con ilustracion + nombre tienda + zona + distancia + categoria.
 * Scroll-snap horizontal en mobile, grid limpio en desktop.
 */

import Link from "next/link";
import { ChevronRight, MapPin } from "@buleje/design-system/icons";
import {
  DoniaElena,
  BodegaAbriendo,
  BodegueroCelebrando,
  MalocaAtardecer,
  MotorizadoUcayali,
  CuadernoFiadoReal,
} from "@/components/ui-system/illustrations";

interface StoreCard {
  id: string;
  name: string;
  zona: string;
  distance: string;
  category: string;
  Illustration: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  href: string;
}

const STORES: StoreCard[] = [
  {
    id: "s-1",
    name: "Bodega Dona Elena",
    zona: "Calleria",
    distance: "0.8 km",
    category: "Abarrotes",
    Illustration: DoniaElena,
    href: "/marketplace/bodega-dona-elena",
  },
  {
    id: "s-2",
    name: "Minimarket San Martin",
    zona: "Manantay",
    distance: "1.4 km",
    category: "Abarrotes",
    Illustration: BodegaAbriendo,
    href: "/marketplace/minimarket-san-martin",
  },
  {
    id: "s-3",
    name: "Carniceria Centro",
    zona: "Yarinacocha",
    distance: "2.1 km",
    category: "Carnes",
    Illustration: BodegueroCelebrando,
    href: "/marketplace/carniceria-centro",
  },
  {
    id: "s-4",
    name: "Mercado Bellavista",
    zona: "Calleria",
    distance: "1.7 km",
    category: "Verduras",
    Illustration: MalocaAtardecer,
    href: "/marketplace/mercado-bellavista",
  },
  {
    id: "s-5",
    name: "Panaderia Yarinacocha",
    zona: "Yarinacocha",
    distance: "2.6 km",
    category: "Panaderia",
    Illustration: MotorizadoUcayali,
    href: "/marketplace/panaderia-yarinacocha",
  },
  {
    id: "s-6",
    name: "Licoreria Manantay",
    zona: "Manantay",
    distance: "3.0 km",
    category: "Licores",
    Illustration: CuadernoFiadoReal,
    href: "/marketplace/licoreria-manantay",
  },
];

export default function RecommendationsStrip() {
  return (
    <section
      aria-labelledby="tiendas-cerca-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-6 sm:mb-8 flex items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">
            Cerca tuyo
          </span>
          <h2
            id="tiendas-cerca-heading"
            className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white"
          >
            Tiendas destacadas cerca tuyo
          </h2>
        </div>
        <Link
          href="/marketplace"
          className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline shrink-0"
        >
          Ver todas
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </Link>
      </header>

      {/* Mobile: horizontal scroll con snap. Desktop: grid */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto sm:overflow-visible scrollbar-none">
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory sm:snap-none">
          {STORES.map((store) => {
            const Ill = store.Illustration;
            return (
              <Link
                key={store.id}
                href={store.href}
                className="group snap-start shrink-0 w-56 sm:w-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
              >
                <div className="aspect-[4/3] bg-gray-50 dark:bg-gray-950 flex items-center justify-center text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-800">
                  <Ill size={88} strokeWidth={1.5} />
                </div>
                <div className="p-4">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400">
                    {store.category}
                  </span>
                  <h3 className="mt-1 text-sm font-extrabold tracking-tight text-gray-900 dark:text-white line-clamp-1">
                    {store.name}
                  </h3>
                  <p className="mt-2 flex items-center gap-1 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
                    <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    {store.zona}
                    <span aria-hidden="true" className="mx-0.5">&middot;</span>
                    {store.distance}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
