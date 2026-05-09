"use client";

/**
 * ExplorarPorOcasion — Grid 2x3 cards editorial con ilustracion grande.
 * 6 ocasiones (desayuno, almuerzo familiar, parrilla, fiesta infantil,
 * noche de pelicula, cena rápida). Ilustraciones reutilizadas del DS.
 */

import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import {
  LacteosRefresh,
  PaicheEnOlla,
  CarniceriaFresca,
  CajaFeliz,
  BebidasVarias,
  VerduraFresca,
} from "@/components/ui-system/illustrations";

interface Ocasion {
  id: string;
  kicker: string;
  title: string;
  description: string;
  Illustration: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  href: string;
}

const OCASIONES: Ocasion[] = [
  {
    id: "desayuno",
    kicker: "Ocasion",
    title: "Desayuno",
    description: "Pan, huevos, leche y frutas para empezar el dia.",
    Illustration: LacteosRefresh,
    href: "/marketplace?ocasion=desayuno",
  },
  {
    id: "almuerzo",
    kicker: "Ocasion",
    title: "Almuerzo familiar",
    description: "Arroz, pollo, guarniciones y refresco natural.",
    Illustration: PaicheEnOlla,
    href: "/marketplace?ocasion=almuerzo-familiar",
  },
  {
    id: "parrilla",
    kicker: "Fin de semana",
    title: "Parrilla del sabado",
    description: "Carnes, chorizos, carbon y cervezas frias.",
    Illustration: CarniceriaFresca,
    href: "/marketplace?ocasion=parrilla",
  },
  {
    id: "fiesta",
    kicker: "Celebracion",
    title: "Fiesta infantil",
    description: "Bocaditos, globos, gaseosas y bolsas sorpresa.",
    Illustration: CajaFeliz,
    href: "/marketplace?ocasion=fiesta-infantil",
  },
  {
    id: "pelicula",
    kicker: "Noche tranquila",
    title: "Noche de pelicula",
    description: "Snacks, gaseosas y ese antojo que siempre falta.",
    Illustration: BebidasVarias,
    href: "/marketplace?ocasion=pelicula",
  },
  {
    id: "cena-rápida",
    kicker: "Express",
    title: "Cena rápida",
    description: "Listo en 20 minutos con ingredientes frescos.",
    Illustration: VerduraFresca,
    href: "/marketplace?ocasion=cena-rápida",
  },
];

export default function ExplorarPorOcasion() {
  return (
    <section
      aria-labelledby="ocasiones-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 mb-2">
          Momentos
        </span>
        <h2
          id="ocasiones-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-[var(--ls-tight)] text-gray-900 dark:text-white"
        >
          Explora por ocasion
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
          Canastas pensadas para momentos del dia a dia — lo que te falta ya lo tenemos agrupado.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {OCASIONES.map((oc) => {
          const Ill = oc.Illustration;
          return (
            <article
              key={oc.id}
              className="group flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
            >
              <div className="mb-4 flex h-36 sm:h-40 items-center justify-center rounded-lg bg-[var(--surface-alt)] dark:bg-gray-950 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors">
                <Ill size={120} strokeWidth={1.5} />
              </div>

              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400">
                {oc.kicker}
              </span>
              <h3 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                {oc.title}
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1">
                {oc.description}
              </p>
              <Link
                href={oc.href}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Ver productos
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
