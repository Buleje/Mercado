"use client";

/**
 * CategoryHero — Hero editorial estilo Buleje.
 * Left: kicker + H1 + subtitle + stats
 * Right: ilustracion grande del DS (monoline, gris).
 *
 * Spacing 8pt grid, tipografia extrabold tracking-tight, color canvas.
 */

import type { CategoriaDef } from "@/lib/db/marketplace-catalog.db";
import {
  LimpiezaDomicilio,
  BodegaAbriendo,
  CarniceriaFresca,
  VerduraFresca,
  BebidasVarias,
  LacteosRefresh,
  CorazonLatiendo,
  PaicheEnOlla,
} from "@/components/ui-system/illustrations";

const ILLUSTRATION_MAP = {
  LimpiezaDomicilio,
  BodegaAbriendo,
  CarniceriaFresca,
  VerduraFresca,
  BebidasVarias,
  LacteosRefresh,
  CorazonLatiendo,
  PaicheEnOlla,
} as const;

interface CategoryHeroProps {
  categoria: CategoriaDef;
  productCount: number;
  storeCount: number;
}

export default function CategoryHero({
  categoria,
  productCount,
  storeCount,
}: CategoryHeroProps) {
  const Illustration = ILLUSTRATION_MAP[categoria.illustration];

  return (
    <section
      aria-labelledby="categoria-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            {categoria.kicker}
          </span>
          <h1
            id="categoria-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]"
          >
            {categoria.label}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
            {categoria.subtitle}
          </p>
          <p className="mt-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <span className="text-gray-900 dark:text-white">
              {productCount}
            </span>{" "}
            producto{productCount === 1 ? "" : "s"}
            <span className="mx-2 text-gray-300 dark:text-gray-700">·</span>
            <span className="text-gray-900 dark:text-white">{storeCount}</span>{" "}
            tienda{storeCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="hidden lg:flex items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-10 text-gray-700 dark:text-gray-200">
          <Illustration size={180} strokeWidth={1.5} />
        </div>
      </div>
    </section>
  );
}
