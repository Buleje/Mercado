"use client";

/**
 * GuiasTips — 3 cards editorial de guias practicas.
 * Ilustracion + titulo + "Leer mas". Contenido de autoridad para la pagina.
 */

import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import {
  EstanteVacio,
  CarniceriaFresca,
  PaicheEnOlla,
} from "@/components/ui-system/illustrations";

interface Guia {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  readingTime: string;
  Illustration: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  href: string;
}

const GUIAS: Guia[] = [
  {
    id: "despensa-básica",
    kicker: "Guia práctica",
    title: "Como armar tu despensa básica",
    summary: "Los 20 productos que siempre deberias tener para no quedarte sin nada a mitad de semana.",
    readingTime: "5 min",
    Illustration: EstanteVacio,
    href: "/marketplace/recetas?guia=despensa-básica",
  },
  {
    id: "parrilla",
    kicker: "Fin de semana",
    title: "Lo que no puede faltar en una parrilla",
    summary: "Desde cantidades por persona hasta el carbon ideal. La guia que tu asado necesita.",
    readingTime: "7 min",
    Illustration: CarniceriaFresca,
    href: "/marketplace/recetas?guia=parrilla",
  },
  {
    id: "recetas-pucallpa",
    kicker: "Regional",
    title: "Recetas caseras de Pucallpa",
    summary: "Tacacho, juane, paiche a la jun y los clasicos que toda cocina amazonica deberia dominar.",
    readingTime: "9 min",
    Illustration: PaicheEnOlla,
    href: "/marketplace/recetas?guia=pucallpa",
  },
];

export default function GuiasTips() {
  return (
    <section
      aria-labelledby="guias-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 mb-2">
          Aprende
        </span>
        <h2
          id="guias-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-[var(--ls-tight)] text-gray-900 dark:text-white"
        >
          Guias para tu casa
        </h2>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {GUIAS.map((g) => {
          const Ill = g.Illustration;
          return (
            <article
              key={g.id}
              className="group flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
            >
              <div className="aspect-[4/3] bg-gray-50 dark:bg-gray-950 flex items-center justify-center text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-800">
                <Ill size={120} strokeWidth={1.5} />
              </div>

              <div className="flex flex-col flex-1 p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 mb-2">
                  <span>{g.kicker}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>{g.readingTime}</span>
                </div>
                <h3 className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {g.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1">
                  {g.summary}
                </p>
                <Link
                  href={g.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Leer mas
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
