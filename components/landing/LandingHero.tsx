"use client";

/**
 * LandingHero — Hero editorial dramático para la landing `/`.
 *
 * Estilo uniforme con NosotrosSection / ComoFuncionaSection / FAQSection:
 *   - Kicker con línea accent h-[3px] w-10
 *   - Título clamp(3rem, 8vw, 6rem) + italic serif accent
 *   - Grid asimétrico 7fr/5fr
 *   - Stats con números masivos tabular-nums (NumberFlow)
 *   - Sin font-display — todo con font-black + tracking-[-0.04em]
 *
 * LEFT (58%): kicker + título dramático + subtítulo + search + geoloc.
 * RIGHT (42%): card hero con ilustración + stats en grid vertical.
 */

import { useRef } from "react";
import { m, useScroll, useTransform, useReducedMotion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { MapPin } from "@buleje/design-system/icons";
import {
  AnimatedSearchBar,
  GeolocationPrompt,
} from "@/components/landing/LandingClientSections";
import { MapaUcayaliAutentico } from "@/components/ui-system/illustrations/pucallpa-locals";
import { BodegaAbriendo } from "@/components/ui-system/illustrations/contextual";

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

  const yBack = useTransform(
    scrollYProgress,
    [0, 1],
    ["0%", reducedMotion ? "0%" : "18%"]
  );
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.4]);

  const heroStats = [
    {
      value: storeCount || 3,
      label: "Bodegas activas",
      suffix: "+",
      decimals: false,
    },
    {
      value: productCount || 84,
      label: "Productos en stock",
      suffix: "+",
      decimals: false,
    },
    {
      value: 25,
      label: "Min promedio delivery",
      suffix: "",
      decimals: false,
    },
    {
      value: avgRating || 4.8,
      label: "Valoración clientes",
      suffix: "",
      decimals: true,
    },
  ];

  return (
    <section
      ref={ref}
      aria-label="Marketplace de bodegas en Pucallpa"
      className="relative overflow-hidden bg-[var(--surface-canvas)]"
    >
      {/* Capa decorativa con parallax sutil */}
      <m.div
        style={{ y: yBack, opacity }}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      >
        <div className="absolute -top-32 -right-40 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl" />
        <div className="absolute top-1/3 -left-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl" />
      </m.div>

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 lg:pt-28 pb-14 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-12 lg:gap-16 items-center">
          {/* ── LEFT — título editorial dramático ───────────────────────── */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-2 lg:order-1"
          >
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Marketplace local · Pucallpa
            </p>

            <h1 className="text-[clamp(2.75rem,8vw,5.75rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
              Tu mercado favorito,
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                ahora en tu celular.
              </span>
            </h1>

            <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
              Bodegas, minimarkets, farmacias y licorerías — todo tu barrio en
              un solo lugar, con delivery en{" "}
              <span className="text-[var(--text-primary)] font-bold">
                25 minutos
              </span>
              .
            </p>

            <m.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
              className="mt-10 max-w-xl"
            >
              <AnimatedSearchBar />
            </m.div>

            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="mt-3"
            >
              <GeolocationPrompt />
            </m.div>
          </m.div>

          {/* ── RIGHT — illustration card + stats editorial ─────────────── */}
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="order-1 lg:order-2"
          >
            <div className="relative rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
              {/* Illustration hero */}
              <div
                className="relative aspect-[5/4] flex items-center justify-center overflow-hidden"
                aria-hidden
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[0.06] via-transparent to-[var(--accent)]/[0.03]" />
                <MapaUcayaliAutentico
                  size={260}
                  className="relative text-[var(--text-primary)]/70"
                />
                {/* Pin accent flotante */}
                <span className="absolute top-6 right-6 inline-flex h-3 w-3 rounded-full bg-[var(--accent)] shadow-lg shadow-[var(--accent)]/40 animate-pulse" />
                {/* Mini card overlay — bodega abriendo */}
                <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]/90 backdrop-blur px-3 py-2.5">
                  <BodegaAbriendo
                    size={36}
                    className="text-[var(--accent)]"
                  />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
                      Abierta ahora
                    </p>
                    <p className="text-sm font-black tracking-tight text-[var(--text-primary)]">
                      120+ bodegas
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats vertical editorial */}
              <div className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">
                {heroStats.map((stat, idx) => (
                  <div
                    key={idx}
                    className="flex items-baseline gap-5 px-6 py-4"
                  >
                    <span className="text-[clamp(1.75rem,3vw,2.5rem)] font-black tabular-nums tracking-[-0.03em] text-[var(--text-primary)] leading-none w-[4.5ch] shrink-0">
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
                        <span className="text-[var(--text-tertiary)]">
                          {stat.suffix}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-[var(--text-secondary)] leading-snug">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </m.div>
        </div>
      </div>
    </section>
  );
}
