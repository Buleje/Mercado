"use client";

/**
 * LandingHero — Hero 2-column para la landing `/`.
 * LEFT (60%): kicker geografico + h1 calido + subtitle + search animado + CTA secundario.
 * RIGHT (40%): stack dual de ilustraciones (MapaUcayali arriba + FamiliaConBolsa abajo).
 *
 * Reemplaza al HeroParallax centrado por una propuesta con mas calidez e identidad local.
 * Reutiliza AnimatedSearchBar + GeolocationPrompt del LandingClientSections.
 */

import { useRef } from "react";
import { m, useScroll, useTransform, useReducedMotion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { MapPin } from "lucide-react";
import {
  AnimatedSearchBar,
  GeolocationPrompt,
} from "@/components/landing/LandingClientSections";
import { MapaUcayaliAutentico } from "@/components/ui-system/illustrations/pucallpa-locals";
import { BodegaAbriendo } from "@/components/ui-system/illustrations/contextual";
import { cn } from "@/lib/utils";

interface Props {
  storeCount: number;
  productCount: number;
  avgRating: number;
}

export default function LandingHero({
  storeCount,
  productCount,
  avgRating,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Parallax sutil en capa de blobs
  const yBack = useTransform(
    scrollYProgress,
    [0, 1],
    ["0%", reducedMotion ? "0%" : "20%"]
  );
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.4]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden noise-texture-bg bg-white dark:bg-gray-950"
    >
      {/* Accent sutil — un solo blob, no capas saturadas multiples */}
      <m.div
        style={{ y: yBack, opacity }}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-32 left-[8%] h-96 w-96 rounded-full bg-[var(--accent)]/5 blur-[120px]" />
      </m.div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 lg:gap-12 items-center">
          {/* LEFT — Content */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-2 lg:order-1"
          >
            {/* Kicker geografico */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wide mb-5">
              <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Marketplace local en Pucallpa
            </span>

            {/* H1 calido + accion — tipografía editorial amazónica */}
            <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-semibold italic tracking-[-0.025em] text-gray-900 dark:text-white leading-[1.02]">
              Tu mercado favorito,{" "}
              <span className="text-primary not-italic font-bold">ahora en tu celular</span>
            </h1>

            {/* Subtitle calido */}
            <p className="mt-5 text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed max-w-xl">
              Bodegas, minimarkets, farmacias y licorerías — todo tu barrio en
              un solo lugar, con delivery en 25 minutos.
            </p>

            {/* Search bar animada (reutiliza componente) */}
            <m.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
              className="mt-8 max-w-xl"
            >
              <AnimatedSearchBar />
            </m.div>

            {/* CTA secundario — geolocalizacion */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-2"
            >
              <GeolocationPrompt />
            </m.div>
          </m.div>

          {/* RIGHT — Illustration stack */}
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="order-1 lg:order-2 flex flex-col items-center gap-5 sm:gap-6"
            aria-hidden="true"
          >
            {/* Mapa — representa zona geografica */}
            <div className="relative w-full max-w-[320px] aspect-square bg-gray-50 dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-amber-400/5" />
              <MapaUcayaliAutentico
                size={220}
                className="relative text-gray-700 dark:text-gray-200"
              />
              {/* Pin accent flotante */}
              <div className="absolute top-5 right-5 h-2.5 w-2.5 rounded-full bg-primary animate-pulse shadow-lg shadow-primary/40" />
            </div>

            {/* Bodega abriendo — representa comercio local */}
            <div className="relative w-full max-w-[320px] aspect-[4/3] bg-gray-50 dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-secondary/5 via-transparent to-primary/5" />
              <BodegaAbriendo
                size={180}
                className="relative text-gray-700 dark:text-gray-200"
              />
            </div>
          </m.div>
        </div>

        {/* Stats strip — editorial trust row, abajo del hero */}
        <m.div
          className="mt-14 pt-10 border-t border-gray-200 dark:border-gray-800 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0 sm:divide-x divide-gray-200 dark:divide-gray-800"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.12, delayChildren: 0.1 },
            },
          }}
        >
          {[
            {
              value: storeCount || 3,
              label: "tiendas activas",
              suffix: "+",
            },
            {
              value: productCount || 84,
              label: "productos en stock",
              suffix: "+",
            },
            {
              value: 25,
              label: "min promedio delivery",
              suffix: "",
            },
            {
              value: avgRating || 4.8,
              label: "valoración clientes",
              decimals: true,
              suffix: "",
            },
          ].map((stat, i) => (
            <m.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4 }}
              className={cn("flex flex-col items-center sm:px-4 py-1")}
            >
              <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums tracking-tight">
                <NumberFlow
                  value={stat.value}
                  format={
                    stat.decimals
                      ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
                      : { maximumFractionDigits: 0 }
                  }
                  locales="es-PE"
                />
                {stat.suffix && (
                  <span className="text-gray-300 dark:text-gray-600">
                    {stat.suffix}
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500 mt-1.5 text-center">
                {stat.label}
              </p>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}
