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
 * LEFT (58%): título dramático + subtítulo + search + CTAs.
 * RIGHT (42%): phone preview floating con product cards reales + chip "25 min".
 */

import { useRef } from "react";
import Link from "next/link";
import { m, useScroll, useTransform, useReducedMotion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { ArrowUpRight, Bike, Star } from "@buleje/design-system/icons";
import {
  BebidasVarias,
  LacteosRefresh,
  VerduraFresca,
  LimpiezaDomicilio,
} from "@/components/ui-system/illustrations/categories";
import {
  AnimatedSearchBar,
  GeolocationPrompt,
} from "@/components/landing/LandingClientSections";

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
    { value: storeCount || 3, label: "Bodegas activas", suffix: "+", decimals: false },
    { value: productCount || 84, label: "Productos en stock", suffix: "+", decimals: false },
    { value: 25, label: "Min promedio delivery", suffix: "", decimals: false },
    { value: avgRating || 4.8, label: "Valoración clientes", suffix: "", decimals: true },
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
          {/* ── LEFT — copy editorial conciso ───────────────────────────── */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-1"
          >
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Pucallpa · Ucayali
            </p>

            <h1 className="text-[clamp(2.5rem,6.5vw,4.75rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.95] text-balance">
              Pucallpa pide.
              <br />
              <span className="italic font-serif text-[var(--accent)] whitespace-nowrap">
                Llega en 25 min.
              </span>
            </h1>

            <p className="mt-6 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-xl">
              El mercado de tu barrio, sin moverte de casa.
            </p>

            <m.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
              className="mt-10 max-w-xl"
            >
              <AnimatedSearchBar />
            </m.div>

            {/* CTA primaria + secundaria */}
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
              className="mt-6 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/marketplace"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                Comprar ahora
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
              </Link>
              <Link
                href="/tiendas"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-4 text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Ver bodegas
              </Link>
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

          {/* ── RIGHT — phone preview con product cards flotantes ─────── */}
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="order-2 max-w-md mx-auto lg:max-w-none"
          >
            <PhoneMockup />
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

/* ── Phone preview con product cards flotantes ──────────────────────── */
function PhoneMockup() {
  return (
    <div aria-hidden className="relative aspect-[4/5] flex items-center justify-center select-none">
      {/* Glow accent detrás del teléfono */}
      <div className="absolute inset-8 rounded-[3rem] bg-linear-to-br from-[var(--accent)]/[0.18] via-transparent to-[var(--accent)]/[0.08] blur-2xl" />

      {/* Frame del teléfono */}
      <div className="relative h-[88%] aspect-[10/19] rounded-[2.5rem] bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-[var(--shadow-xl)] shadow-[var(--accent)]/10 overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-28 bg-[var(--text-primary)] rounded-b-2xl z-20" />

        {/* Header app */}
        <div className="px-4 pt-10 pb-3 bg-linear-to-b from-[var(--accent)]/10 to-transparent">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Entregar en
              </p>
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                Av. Centenario · 14
              </p>
            </div>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
              <Bike className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </div>

          {/* Search mock */}
          <div className="mt-3 h-9 rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-soft)] flex items-center px-3 text-xs text-[var(--text-tertiary)] font-medium">
            Buscar yogurt, fideos, gaseosa…
          </div>
        </div>

        {/* Categorías chips */}
        <div className="px-3 mt-2 flex gap-1.5 overflow-hidden">
          {["Bodegas", "Frutería", "Farmacia", "Licor"].map((c, i) => (
            <span
              key={c}
              className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-extrabold whitespace-nowrap ${
                i === 0
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-soft)]"
              }`}
            >
              {c}
            </span>
          ))}
        </div>

        {/* Product cards mock — grid 2 cols con ilustraciones del DS */}
        <div className="px-3 mt-3 grid grid-cols-2 gap-2">
          {[
            { name: "Inca Kola 1.5L", price: "S/ 5.50", Illu: BebidasVarias, tone: "bg-amber-100" },
            { name: "Pan francés ×6", price: "S/ 1.80", Illu: LacteosRefresh, tone: "bg-orange-100" },
            { name: "Plátano isla", price: "S/ 0.50", Illu: VerduraFresca, tone: "bg-lime-100" },
            { name: "Detergente Bolívar", price: "S/ 12.00", Illu: LimpiezaDomicilio, tone: "bg-sky-100" },
          ].map((p) => (
            <div
              key={p.name}
              className="rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-soft)] p-2.5"
            >
              <div className={`aspect-square rounded-lg ${p.tone} flex items-center justify-center mb-1.5 overflow-hidden`}>
                <p.Illu size={48} className="text-[var(--text-primary)]/80" />
              </div>
              <p className="text-xs font-bold text-[var(--text-primary)] leading-tight line-clamp-2 min-h-[2em]">
                {p.name}
              </p>
              <p className="text-sm font-black text-[var(--accent)] mt-1">{p.price}</p>
            </div>
          ))}
        </div>

        {/* Footer CTA mock */}
        <div className="absolute bottom-3 left-3 right-3 h-11 rounded-xl bg-[var(--accent)] text-white flex items-center justify-between px-4 shadow-lg">
          <span className="text-xs font-extrabold">Ver carrito · 4 items</span>
          <span className="text-xs font-black">S/ 19.80</span>
        </div>
      </div>

      {/* Chip flotante: ETA en vivo (top-right) */}
      <div className="absolute top-2 -right-2 sm:right-0 lg:-right-6 flex items-center gap-2.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3.5 py-2.5 shadow-[var(--shadow-lg)]">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand-success)] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--brand-success)]" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
            En camino
          </p>
          <p className="text-sm font-black text-[var(--text-primary)] leading-tight">
            Llega en 22 min
          </p>
        </div>
      </div>

      {/* Chip flotante: rating (bottom-left) */}
      <div className="absolute bottom-4 -left-2 sm:left-0 lg:-left-6 flex items-center gap-2.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3.5 py-2.5 shadow-[var(--shadow-lg)]">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
          <Star className="h-4 w-4 fill-current" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
            Vecinos felices
          </p>
          <p className="text-sm font-black text-[var(--text-primary)] leading-tight">
            4.8 / 5 · +120 reseñas
          </p>
        </div>
      </div>
    </div>
  );
}
