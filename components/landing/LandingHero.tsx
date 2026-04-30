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
        <div className="grid grid-cols-1 lg:grid-cols-[6fr_5fr] gap-10 lg:gap-14 items-center">
          {/* ── LEFT — título editorial dramático ───────────────────────── */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-2 lg:order-1"
          >
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
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

          {/* ── RIGHT — ilustracion protagonista editorial ─────────────── */}
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="order-1 lg:order-2"
          >
            <div
              aria-hidden
              className="relative aspect-[4/3] flex items-center justify-center"
            >
              {/* Gradient accent sutil de fondo */}
              <div className="absolute inset-4 rounded-3xl bg-linear-to-br from-[var(--accent)]/[0.06] via-transparent to-[var(--accent)]/[0.02]" />

              {/* Mapa grande — protagonista */}
              <MapaUcayaliAutentico
                size={440}
                className="relative text-[var(--text-primary)]/75"
              />

              {/* Chip bodega flotante — bottom-left.
                  UX P1-1 fix 2026-04-30: antes "Don Paco · 5 min" era un
                  dueño inventado. Ahora copy honesto sobre cobertura local
                  sin atribuir nombre falso. */}
              <div className="absolute bottom-6 left-6 flex items-center gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3 shadow-sm">
                <BodegaAbriendo size={32} className="text-[var(--accent)]" />
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
                    Bodegas cerca tuyo
                  </p>
                  <p className="text-sm font-black tracking-tight text-[var(--text-primary)]">
                    Pucallpa · Ucayali
                  </p>
                </div>
              </div>

              {/* Pin accent flotante — top-right */}
              <span className="absolute top-10 right-10 inline-flex h-3 w-3 rounded-full bg-[var(--accent)] shadow-lg shadow-[var(--accent)]/40 animate-pulse" />
            </div>
          </m.div>
        </div>

        {/* Stats strip horizontal — editorial fuera del card, full-width */}
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}
          className="mt-16 sm:mt-20 pt-8 border-t border-[var(--rule-soft)]"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
            {heroStats.map((stat, idx) => (
              <div
                key={idx}
                className={`${idx > 0 ? "md:border-l md:border-[var(--rule-soft)] md:pl-6" : ""}`}
              >
                <p className="text-[clamp(2rem,4vw,3rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none">
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
                    <span className="text-[var(--accent)]">{stat.suffix}</span>
                  )}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </m.div>
      </div>
    </section>
  );
}
