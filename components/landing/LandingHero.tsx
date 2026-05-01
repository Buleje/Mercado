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
import { ArrowUpRight, Bike, Star, Plus, MapPin } from "@buleje/design-system/icons";
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

/* ── Product cards mock con gradientes vibrantes ────────────────────── */
const PRODUCT_CARDS: Array<{
  kicker: string;
  name: string;
  price: string;
  was?: string;
  bg: string;
}> = [
  {
    kicker: "Inca",
    name: "Inca Kola 1.5L",
    price: "S/ 4.90",
    was: "S/ 5.50",
    bg: "bg-linear-to-br from-amber-400 via-yellow-500 to-amber-600",
  },
  {
    kicker: "Pollo",
    name: "Pollo a la brasa",
    price: "S/ 28",
    bg: "bg-linear-to-br from-rose-500 via-red-500 to-orange-500",
  },
  {
    kicker: "Verde",
    name: "Verduras del día",
    price: "S/ 6.50",
    bg: "bg-linear-to-br from-lime-500 via-emerald-500 to-teal-600",
  },
  {
    kicker: "Pilsen",
    name: "Pilsen 6-pack",
    price: "S/ 24",
    was: "S/ 30",
    bg: "bg-linear-to-br from-sky-500 via-cyan-500 to-blue-600",
  },
];

/* ── Phone preview editorial (sin illustrations, type-forward) ──────── */
function PhoneMockup() {
  return (
    <div aria-hidden className="relative h-[520px] sm:h-[580px] lg:h-[640px] flex items-center justify-center select-none">
      {/* Glow accent multicapa detrás del teléfono */}
      <div className="absolute inset-x-4 top-8 bottom-4 rounded-[3.5rem] bg-linear-to-br from-[var(--accent)]/[0.22] via-fuchsia-500/[0.08] to-amber-400/[0.12] blur-3xl" />
      <div className="absolute inset-x-12 top-16 bottom-12 rounded-[3rem] bg-linear-to-tr from-[var(--accent)]/[0.18] to-transparent blur-2xl" />

      {/* Frame del teléfono — bezel oscuro, screen integrado */}
      <div className="relative h-full w-[260px] sm:w-[290px] lg:w-[320px] rounded-[2.75rem] bg-[var(--text-primary)] p-2 shadow-[var(--shadow-xl)] shadow-[var(--accent)]/20">
        <div className="relative h-full w-full rounded-[2.25rem] bg-[var(--surface-canvas)] overflow-hidden">
          {/* Dynamic island (notch moderno) */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 h-6 w-24 bg-[var(--text-primary)] rounded-full z-20" />

          {/* Header app */}
          <div className="px-4 pt-12 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-xs font-extrabold text-[var(--text-primary)] leading-none">
                    Pucallpa
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] leading-tight mt-0.5">
                    Av. Centenario 14
                  </p>
                </div>
              </div>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--rule-soft)] text-[var(--text-secondary)]">
                <Bike className="h-4 w-4" strokeWidth={2.25} />
              </span>
            </div>

            {/* Search mock */}
            <div className="mt-3 h-9 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] flex items-center px-3 text-xs text-[var(--text-tertiary)] font-medium">
              <span className="mr-2 text-[var(--text-tertiary)]">⌕</span>
              ¿Qué necesitas?
            </div>
          </div>

          {/* Hero offer banner — gradient brand */}
          <div className="mx-4 rounded-2xl bg-linear-to-br from-[var(--accent)] via-[var(--accent)] to-emerald-600 p-4 text-white relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-white/10" />
            <p className="text-xs font-black uppercase tracking-widest opacity-90">
              Oferta del día
            </p>
            <p className="mt-1 text-xl font-black leading-tight">
              -25% en
              <br />
              tu primer pedido
            </p>
            <p className="mt-2 text-xs font-bold opacity-90">
              Entrega gratis · Hoy hasta 9pm
            </p>
            <span className="absolute right-3 bottom-3 inline-flex h-7 px-3 items-center rounded-full bg-white text-[var(--accent)] text-xs font-black">
              YAPE25
            </span>
          </div>

          {/* Section title */}
          <div className="px-4 mt-4 flex items-center justify-between">
            <p className="text-sm font-black text-[var(--text-primary)]">
              Más vendidos
            </p>
            <p className="text-xs font-bold text-[var(--accent)]">Ver todo</p>
          </div>

          {/* Product cards — gradient cards typography-forward */}
          <div className="px-4 mt-2 grid grid-cols-2 gap-2.5">
            {PRODUCT_CARDS.map((p) => (
              <div
                key={p.name}
                className="relative rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
              >
                <div className={`relative h-20 ${p.bg} flex items-end p-2`}>
                  <p className="text-2xl font-black tracking-[-0.03em] text-white drop-shadow-sm leading-none">
                    {p.kicker}
                  </p>
                  <span className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--accent)] shadow">
                    <Plus className="h-3 w-3" strokeWidth={3} />
                  </span>
                </div>
                <div className="px-2 py-2">
                  <p className="text-xs font-bold text-[var(--text-primary)] leading-tight line-clamp-1">
                    {p.name}
                  </p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <p className="text-sm font-black text-[var(--text-primary)]">
                      {p.price}
                    </p>
                    {p.was && (
                      <p className="text-xs font-bold text-[var(--text-tertiary)] line-through">
                        {p.was}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom: order tracker mini-card (delivery rider en vivo) */}
          <div className="absolute bottom-3 left-3 right-3 rounded-2xl bg-[var(--text-primary)] text-white p-3 shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <Bike className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand-success)] opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--brand-success)] border border-[var(--text-primary)]" />
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold opacity-80">
                  Tu pedido va en camino
                </p>
                <p className="text-sm font-black leading-tight">
                  Marco · Llega en 12 min
                </p>
              </div>
              <span className="text-xs font-black">→</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2.5 h-1 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full w-3/4 rounded-full bg-linear-to-r from-emerald-400 to-[var(--accent)]" />
            </div>
          </div>
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

      {/* Chip flotante: rating (mid-left, no tapa tracker) */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-3 sm:-left-4 lg:-left-8 flex items-center gap-2.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3.5 py-2.5 shadow-[var(--shadow-lg)]">
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
