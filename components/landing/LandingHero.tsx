"use client";

/**
 * LandingHero — Hero SaaS dramático para `/`.
 *
 * Positioning: plataforma todo-en-uno para negocios (no es B2C marketplace).
 * El phone preview es ahora interactivo: toast en vivo, tracker animado,
 * contador de ventas, pulso de elementos clave.
 *
 * LEFT: kicker + título dramático + subhead + CTAs (Probá gratis / Ver demo).
 * RIGHT: phone preview animado con dashboard del negocio.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  m,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import NumberFlow from "@number-flow/react";
import {
  ArrowUpRight,
  Bike,
  Star,
  Plus,
  TrendingUp,
  ShoppingBag,
} from "@buleje/design-system/icons";

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
    { value: storeCount || 240, label: "Negocios vendiendo", suffix: "+", decimals: false },
    { value: productCount || 18000, label: "Productos en catálogo", suffix: "+", decimals: false },
    { value: 5, label: "Min de setup", suffix: "", decimals: false },
    { value: avgRating || 4.8, label: "Valoración clientes", suffix: "", decimals: true },
  ];

  return (
    <section
      ref={ref}
      aria-label="Plataforma todo-en-uno para tu negocio"
      className="relative overflow-hidden bg-[var(--surface-canvas)]"
    >
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
          {/* ── LEFT — copy SaaS ────────────────────────────────────────── */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="order-1"
          >
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Plataforma todo-en-uno
            </p>

            <h1 className="text-[clamp(2.5rem,6.5vw,4.75rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.95] text-balance">
              Más clientes. Más pedidos.
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                Cero tecnología.
              </span>
            </h1>

            <p className="mt-6 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-xl">
              Catálogo, pagos Yape, delivery y reportes — todo listo en 5
              minutos. Vos te enfocás en vender.
            </p>

            {/* CTA primaria + secundaria */}
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/abrir-tienda"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                Probá gratis 90 días
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
              </Link>
              <Link
                href="#como-funciona"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-4 text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Ver demo
              </Link>
            </m.div>

            {/* Trust strip — Yape, etc. */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="mt-8 flex items-center gap-2 text-sm text-[var(--text-tertiary)]"
            >
              <span aria-hidden className="inline-flex h-2 w-2 rounded-full bg-[var(--brand-success)]" />
              Sin tarjeta · Cero comisión los primeros 90 días
            </m.div>
          </m.div>

          {/* ── RIGHT — phone interactivo ─────────────────────────────── */}
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="order-2 max-w-md mx-auto lg:max-w-none"
          >
            <PhoneMockup reducedMotion={!!reducedMotion} />
          </m.div>
        </div>

        {/* Stats strip */}
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

/* ── Phone preview ANIMADO — dashboard del negocio en vivo ──────────── */

const ROTATING_ORDERS = [
  { customer: "Mariela", total: "47.50", items: 4 },
  { customer: "Carlos R.", total: "82.00", items: 7 },
  { customer: "Doña Elena", total: "28.90", items: 3 },
  { customer: "Andrés", total: "115.00", items: 9 },
  { customer: "Pedro M.", total: "39.80", items: 5 },
];

function PhoneMockup({ reducedMotion }: { reducedMotion: boolean }) {
  // Contador de ventas que va subiendo
  const [sales, setSales] = useState(2840);
  const [orderIdx, setOrderIdx] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [progress, setProgress] = useState(45);

  useEffect(() => {
    if (reducedMotion) return;
    // Cada 3.2s: nueva orden entra + sumar ventas + show toast + reset progress
    const tick = setInterval(() => {
      setOrderIdx((i) => (i + 1) % ROTATING_ORDERS.length);
      setSales((s) => s + Math.floor(Math.random() * 80) + 20);
      setShowToast(true);
      setProgress(0);
      setTimeout(() => setShowToast(false), 2400);
    }, 3200);

    return () => clearInterval(tick);
  }, [reducedMotion]);

  // Progreso de la barra del tracker animado (0 → 100% en 3s loop)
  useEffect(() => {
    if (reducedMotion) {
      setProgress(75);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) % 3200;
      setProgress(Math.min(100, (elapsed / 3200) * 100));
    }, 50);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const currentOrder = ROTATING_ORDERS[orderIdx];

  return (
    <div aria-hidden className="relative h-[520px] sm:h-[580px] lg:h-[640px] flex items-center justify-center select-none">
      {/* Glow accent multicapa */}
      <div className="absolute inset-x-4 top-8 bottom-4 rounded-[3.5rem] bg-linear-to-br from-[var(--accent)]/[0.22] via-fuchsia-500/[0.08] to-amber-400/[0.12] blur-3xl" />
      <div className="absolute inset-x-12 top-16 bottom-12 rounded-[3rem] bg-linear-to-tr from-[var(--accent)]/[0.18] to-transparent blur-2xl" />

      {/* Frame del teléfono */}
      <div className="relative h-full w-[260px] sm:w-[290px] lg:w-[320px] rounded-[2.75rem] bg-[var(--text-primary)] p-2 shadow-[var(--shadow-xl)] shadow-[var(--accent)]/20">
        <div className="relative h-full w-full rounded-[2.25rem] bg-[var(--surface-canvas)] overflow-hidden">
          {/* Dynamic island */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 h-6 w-24 bg-[var(--text-primary)] rounded-full z-20" />

          {/* Header del dashboard del negocio */}
          <div className="px-4 pt-12 pb-3 bg-linear-to-b from-[var(--accent)]/8 to-transparent">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Mi negocio
            </p>
            <p className="text-base font-black text-[var(--text-primary)] leading-tight mt-0.5">
              Hoy estás vendiendo
            </p>
          </div>

          {/* Contador de ventas animado */}
          <div className="px-4 mt-1">
            <p className="text-[2.75rem] font-black tabular-nums tracking-[-0.04em] text-[var(--text-primary)] leading-none">
              S/{" "}
              <NumberFlow
                value={sales}
                format={{ maximumFractionDigits: 0 }}
                locales="es-PE"
              />
            </p>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-success)]/12 px-2 py-0.5">
              <TrendingUp className="h-3 w-3 text-[var(--brand-success)]" strokeWidth={2.5} />
              <span className="text-xs font-extrabold text-[var(--brand-success)]">
                +18% vs ayer
              </span>
            </div>
          </div>

          {/* Mini cards de KPI */}
          <div className="px-4 mt-3 grid grid-cols-2 gap-2">
            <KpiCard
              kicker="Pedidos"
              value={42 + orderIdx}
              tone="bg-linear-to-br from-amber-400 to-orange-500"
            />
            <KpiCard
              kicker="Clientes"
              value={128 + orderIdx * 2}
              tone="bg-linear-to-br from-fuchsia-500 to-rose-500"
            />
          </div>

          {/* Tracker pedido en vivo */}
          <div className="px-4 mt-3">
            <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-[var(--text-primary)]">
                  Pedido #2403
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-success)]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand-success)] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand-success)]" />
                  </span>
                  En camino
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
                  <Bike className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <p className="text-xs text-[var(--text-secondary)]">
                  Marco · Llega en{" "}
                  <span className="font-black text-[var(--text-primary)]">
                    12 min
                  </span>
                </p>
              </div>
              {/* Barra de progreso animada */}
              <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-linear-to-r from-emerald-400 to-[var(--accent)] transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="absolute bottom-3 left-3 right-3 h-11 rounded-xl bg-[var(--accent)] text-white flex items-center justify-between px-4 shadow-[var(--shadow-lg)]">
            <span className="text-xs font-extrabold">Ver todos los pedidos</span>
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
          </div>

          {/* Toast "+1 nuevo pedido" — animado */}
          <AnimatePresence>
            {showToast && (
              <m.div
                initial={{ y: -40, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -20, opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="absolute top-12 left-3 right-3 rounded-2xl bg-[var(--text-primary)] text-white px-3 py-2.5 shadow-2xl flex items-center gap-2.5 z-30"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand-success)]/25 text-[var(--brand-success)] shrink-0">
                  <ShoppingBag className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold opacity-80 leading-none">
                    Nuevo pedido · {currentOrder.items} items
                  </p>
                  <p className="text-sm font-black leading-tight mt-0.5 truncate">
                    {currentOrder.customer} · S/ {currentOrder.total}
                  </p>
                </div>
                <span className="text-xs font-black text-[var(--brand-success)] shrink-0">
                  +1
                </span>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Chip flotante: ventas del mes (top-right) */}
      <m.div
        animate={reducedMotion ? {} : { y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-4 -right-2 sm:right-0 lg:-right-8 flex items-center gap-2.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3.5 py-2.5 shadow-[var(--shadow-lg)]"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-success)]/15 text-[var(--brand-success)]">
          <TrendingUp className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
            Este mes
          </p>
          <p className="text-sm font-black text-[var(--text-primary)] leading-tight">
            +S/ 12,430
          </p>
        </div>
      </m.div>

      {/* Chip flotante: rating clientes (mid-left) */}
      <m.div
        animate={reducedMotion ? {} : { y: [0, 6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        className="absolute top-1/2 -translate-y-1/2 -left-3 sm:-left-4 lg:-left-8 flex items-center gap-2.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3.5 py-2.5 shadow-[var(--shadow-lg)]"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
          <Star className="h-4 w-4 fill-current" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
            Tus clientes
          </p>
          <p className="text-sm font-black text-[var(--text-primary)] leading-tight">
            4.8 / 5 · +120 reseñas
          </p>
        </div>
      </m.div>

      {/* Chip flotante: + nueva tienda (bottom-right) */}
      <m.div
        animate={reducedMotion ? {} : { y: [0, -4, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-12 -right-2 sm:right-0 lg:-right-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-3.5 py-2 shadow-[var(--shadow-lg)] shadow-[var(--accent)]/40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        <span className="text-xs font-black">Sin código</span>
      </m.div>
    </div>
  );
}

function KpiCard({
  kicker,
  value,
  tone,
}: {
  kicker: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="relative rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <div className={`absolute -top-6 -right-6 h-16 w-16 rounded-full ${tone} opacity-30 blur-xl`} />
      <div className="relative px-2.5 py-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
          {kicker}
        </p>
        <p className="text-xl font-black tabular-nums tracking-tight text-[var(--text-primary)] mt-1 leading-none">
          <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
        </p>
      </div>
    </div>
  );
}
