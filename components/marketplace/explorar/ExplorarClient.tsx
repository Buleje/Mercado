"use client";

/**
 * ExplorarClient — Orchestrator de la pagina /marketplace/explorar.
 * Layout: Hero + secciones apiladas con respiracion 8pt grid.
 *
 * Stack canonico (top → bottom):
 *   1. ExplorarHero (kicker + h1 + search + trust)
 *   2. QuickAccessGrid (6 boxes 2x2 illustrations)
 *   3. RecommendationsStrip (tiendas cerca)
 *   4. OfertasFlash (grid con ProductBadge teal)
 *   5. ExplorarPorSector (mini-boxes con icons)
 *   6. ExplorarPorOcasion (6 editorial cards)
 *   7. GuiasTips (3 cards de contenido)
 *   8. FinalCTA (abrir tienda)
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import ExplorarHero from "./ExplorarHero";
import QuickAccessGrid from "./QuickAccessGrid";
import RecommendationsStrip from "./RecommendationsStrip";
import OfertasFlash from "./OfertasFlash";
import ExplorarPorSector from "./ExplorarPorSector";
import ExplorarPorOcasion from "./ExplorarPorOcasion";
import GuiasTips from "./GuiasTips";
import RecentlyViewed from "@/components/store/RecentlyViewed";

function FinalCTA() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-8 sm:p-12">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            Para bodegueros
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.1]">
            Abre tu tienda y vende a todo Pucallpa
          </h2>
          <p className="mt-4 text-base text-gray-500 dark:text-gray-400 leading-relaxed">
            Miles de vecinos ya estan buscando lo que tu vendes. Pon tu bodega online en 5 minutos, sin codigo y sin permanencia.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/marketplace/registrar"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary/90 transition-colors"
            >
              Abrir mi tienda gratis
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Link>
            <Link
              href="/marketplace/negocios"
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-700 px-6 py-3 text-sm font-bold text-gray-900 dark:text-white hover:bg-white dark:hover:bg-gray-950 transition-colors"
            >
              Ver como funciona
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ExplorarClient() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ExplorarHero />

      <div className="py-10 sm:py-14 space-y-12 sm:space-y-16">
        <QuickAccessGrid />
        <RecommendationsStrip />
        <OfertasFlash />
        <ExplorarPorSector />
        <ExplorarPorOcasion />
        <GuiasTips />
        <RecentlyViewed />
        <FinalCTA />
      </div>
    </div>
  );
}
