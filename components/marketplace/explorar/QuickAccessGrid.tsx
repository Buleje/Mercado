"use client";

/**
 * QuickAccessGrid — Hub de descubrimiento tipo "Amazon quick access"
 * adaptado al design system Buleje (ilustraciones monoline, sin fotos).
 *
 * 6 cajas apiladas en grid 3x2 desktop / 2x3 tablet / 1x6 mobile.
 * Cada caja: 2x2 mini-ilustraciones del DS + CTA.
 *
 * Estilo canonico: bg canvas + rule-soft + rounded-xl + hover shadow-md.
 */

import Link from "next/link";
import type { ComponentType, SVGAttributes } from "react";
import { ChevronRight } from "@buleje/design-system/icons";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
  PaicheEnOlla,
  BodegaAbriendo,
  DoniaElena,
  CuadernoFiadoReal,
  BodegueroCelebrando,
  MotoRuta,
  MapaUcayaliAutentico,
  PedidoLlegando,
  MotorizadoUcayali,
  CorazonLatiendo,
  CajaFeliz,
  TrofeoEvolving,
  OllaVacia,
  EstanteVacio,
  FrascoEstrellas,
} from "@/components/ui-system/illustrations";

type Illustration = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
} & SVGAttributes<SVGSVGElement>>;

interface QuickAccessBox {
  id: string;
  kicker: string;
  title: string;
  illustrations: [Illustration, Illustration, Illustration, Illustration];
  cta: string;
  href: string;
}

const BOXES: QuickAccessBox[] = [
  {
    id: "semana",
    kicker: "Despensa",
    title: "Para la semana",
    illustrations: [VerduraFresca, CarniceriaFresca, LacteosRefresh, BebidasVarias],
    cta: "Arma tu despensa",
    href: "/marketplace/categoria/abarrotes",
  },
  {
    id: "cocina",
    kicker: "Inspiracion",
    title: "Cocina hoy",
    illustrations: [PaicheEnOlla, OllaVacia, FrascoEstrellas, VerduraFresca],
    cta: "Ver recetas",
    href: "/marketplace/recetas",
  },
  {
    id: "limpieza",
    kicker: "Hogar",
    title: "Limpieza & hogar",
    illustrations: [LimpiezaDomicilio, EstanteVacio, CajaFeliz, FrascoEstrellas],
    cta: "Ver productos",
    href: "/marketplace/categoria/limpieza-hogar",
  },
  {
    id: "negocio",
    kicker: "Bodegueros",
    title: "Para tu negocio",
    illustrations: [BodegaAbriendo, DoniaElena, CuadernoFiadoReal, BodegueroCelebrando],
    cta: "Abre tu tienda",
    href: "/marketplace/registrar",
  },
  {
    id: "delivery",
    kicker: "Rapido",
    title: "Delivery express",
    illustrations: [MotoRuta, MapaUcayaliAutentico, PedidoLlegando, MotorizadoUcayali],
    cta: "Pide en 25 min",
    href: "/marketplace?delivery=express",
  },
  {
    id: "ofertas",
    kicker: "Ahorra",
    title: "Cupones & ofertas",
    illustrations: [CorazonLatiendo, TrofeoEvolving, FrascoEstrellas, CajaFeliz],
    cta: "Ver descuentos",
    href: "/marketplace/ofertas",
  },
];

export default function QuickAccessGrid() {
  return (
    <section
      aria-labelledby="quick-access-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">
          Acceso rapido
        </span>
        <h2
          id="quick-access-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white"
        >
          Empieza por donde quieras
        </h2>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {BOXES.map((box) => (
          <article
            key={box.id}
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
          >
            <div className="flex flex-col h-full">
              <div className="mb-4">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400">
                  {box.kicker}
                </span>
                <h3 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {box.title}
                </h3>
              </div>

              {/* 2x2 mini illustrations grid */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                {box.illustrations.map((Ill, idx) => (
                  <div
                    key={idx}
                    className="aspect-square rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors"
                  >
                    <Ill size={56} strokeWidth={1.5} />
                  </div>
                ))}
              </div>

              <Link
                href={box.href}
                className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                {box.cta}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
