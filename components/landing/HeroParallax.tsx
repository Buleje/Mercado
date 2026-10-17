"use client";

import { useRef } from "react";
import { m, useScroll, useTransform, useReducedMotion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { MapPin } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  GeolocationPrompt,
  AnimatedSearchBar,
} from "@/components/landing/LandingClientSections";

interface Props {
  storeCount: number;
  productCount: number;
  avgRating: number;
}

export default function HeroParallax({
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

  // Capas de parallax — profundidades distintas
  const yBack = useTransform(scrollYProgress, [0, 1], ["0%", reducedMotion ? "0%" : "25%"]);
  const yMid = useTransform(scrollYProgress, [0, 1], ["0%", reducedMotion ? "0%" : "12%"]);
  const yFront = useTransform(scrollYProgress, [0, 1], ["0%", reducedMotion ? "0%" : "-6%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.3]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden py-16 sm:py-20 lg:py-24 bg-white dark:bg-gray-950"
    >
      {/* Capa 1 (fondo) — accent sutil, un solo blob tokenizado */}
      <m.div
        style={{ y: yBack }}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-[var(--accent)]/5 blur-[120px]" />
      </m.div>

      {/* Capa 2 (medio) — grid pattern sutil */}
      <m.div
        style={{ y: yMid, opacity }}
        className="absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.08]"
        aria-hidden="true"
      >
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </m.div>

      {/* Capa 3 (frente) — contenido */}
      <m.div
        style={{ y: yFront }}
        className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center"
      >
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide mb-5">
            <MapPin className="h-3 w-3" />
            Pucallpa · Ucayali · Todo el Perú
          </span>

          <h1 className="text-4xl sm:text-5xl lg:text-[64px] font-extrabold tracking-[var(--ls-tight)] text-gray-900 dark:text-white leading-[1.05]">
            Pide lo que quieras,
            <br className="hidden sm:block" />
            <span className="text-gray-400 dark:text-gray-500">te lo llevamos</span>
          </h1>

          <p className="mt-6 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            Bodegas, minimarkets, licorerías, farmacias y más — todo desde tu
            celular con delivery rápido.
          </p>
        </m.div>

        {/* Animated search bar */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
        >
          <AnimatedSearchBar />
        </m.div>

        {/* Stats animados con NumberFlow */}
        <m.div
          className="mt-10 grid grid-cols-3 gap-4 sm:gap-8 max-w-xl mx-auto"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.15, delayChildren: 0.3 },
            },
          }}
        >
          {[
            {
              value: storeCount || 10,
              label: "tiendas activas",
            },
            {
              value: productCount || 500,
              label: "productos",
            },
            {
              value: avgRating || 4.8,
              label: "valoración",
              decimals: true,
            },
          ].map((stat, i, arr) => (
            <m.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4 }}
              className={cn(
                "flex flex-col items-center py-1",
                i > 0 && "border-l border-gray-200 dark:border-gray-800",
              )}
            >
              <div className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tabular-nums tracking-tight">
                <NumberFlow
                  value={stat.value}
                  format={
                    stat.decimals
                      ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
                      : { maximumFractionDigits: 0 }
                  }
                  locales="es-PE"
                />
                {!stat.decimals && i < arr.length - 1 && (
                  <span className="text-gray-300 dark:text-gray-600">+</span>
                )}
              </div>
              <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500 mt-1.5">
                {stat.label}
              </p>
            </m.div>
          ))}
        </m.div>

        <m.div
          className="mt-6 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <GeolocationPrompt />
        </m.div>
      </m.div>
    </section>
  );
}
