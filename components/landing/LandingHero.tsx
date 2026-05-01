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

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  m,
  useMotionValue,
  useScroll,
  useSpring,
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
  Banknote,
  CheckCircle2,
  Heart,
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

type EventKind = "order" | "payment" | "review" | "delivery";

interface LiveEvent {
  kind: EventKind;
  title: string;
  subtitle: string;
  amount?: string;
  delta: number; // suma a las ventas
}

const EVENT_STREAM: LiveEvent[] = [
  { kind: "order", title: "Nuevo pedido · 4 items", subtitle: "Mariela · Av. Centenario", amount: "+S/ 47.50", delta: 47 },
  { kind: "payment", title: "Pago Yape recibido", subtitle: "Carlos R. · #2402", amount: "+S/ 82.00", delta: 82 },
  { kind: "review", title: "Cliente dejó 5 estrellas", subtitle: "Doña Elena · Pollo a la brasa", delta: 0 },
  { kind: "delivery", title: "Pedido entregado", subtitle: "Andrés · Llegó en 14 min", amount: "+S/ 115.00", delta: 115 },
  { kind: "order", title: "Nuevo pedido · 7 items", subtitle: "Pedro M. · Centro comercial", amount: "+S/ 39.80", delta: 40 },
  { kind: "payment", title: "Pago Plin recibido", subtitle: "Lucía · #2401", amount: "+S/ 28.90", delta: 29 },
];

const EVENT_META: Record<EventKind, { Icon: typeof ShoppingBag; tone: string }> = {
  order: { Icon: ShoppingBag, tone: "bg-[var(--brand-success)]/25 text-[var(--brand-success)]" },
  payment: { Icon: Banknote, tone: "bg-emerald-500/25 text-emerald-400" },
  review: { Icon: Heart, tone: "bg-rose-500/25 text-rose-400" },
  delivery: { Icon: CheckCircle2, tone: "bg-sky-500/25 text-sky-400" },
};

// Sparkline path: día de ventas (12 puntos)
const SPARKLINE_POINTS = [22, 28, 24, 35, 30, 42, 38, 48, 52, 60, 68, 75];

// Hourly bars: ventas por hora del día (12 barras, valor relativo)
const HOURLY_BARS = [12, 18, 24, 30, 35, 28, 42, 55, 68, 75, 82, 90];

const SEARCH_PHRASES = [
  "agregar producto",
  "ver pedidos pendientes",
  "imprimir reporte",
  "crear cupón",
];

function PhoneMockup({ reducedMotion }: { reducedMotion: boolean }) {
  const [sales, setSales] = useState(2840);
  const [eventIdx, setEventIdx] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [progress, setProgress] = useState(45);
  const [toastStack, setToastStack] = useState<number[]>([]); // últimos 2 event indexes
  const [searchText, setSearchText] = useState("");

  // Mouse tilt 3D
  const tiltX = useSpring(useMotionValue(0), { stiffness: 120, damping: 18 });
  const tiltY = useSpring(useMotionValue(0), { stiffness: 120, damping: 18 });
  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    tiltY.set(x * 8); // rotateY
    tiltX.set(-y * 8); // rotateX
  };
  const handleMouseLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  // Eventos rotativos cada 3.4s
  useEffect(() => {
    if (reducedMotion) {
      setToastStack([0]);
      return;
    }
    const tick = setInterval(() => {
      setEventIdx((i) => {
        const next = (i + 1) % EVENT_STREAM.length;
        setToastStack((st) => [next, ...st].slice(0, 2));
        return next;
      });
      setPulse((p) => p + 1);
    }, 3400);
    return () => clearInterval(tick);
  }, [reducedMotion]);

  // Sumar ventas cuando cambia evento
  useEffect(() => {
    if (reducedMotion) return;
    const ev = EVENT_STREAM[eventIdx];
    if (ev.delta > 0) setSales((s) => s + ev.delta);
  }, [eventIdx, reducedMotion]);

  // Tracker progress 0→100% loop
  useEffect(() => {
    if (reducedMotion) { setProgress(75); return; }
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) % 3400;
      setProgress(Math.min(100, (elapsed / 3400) * 100));
    }, 50);
    return () => clearInterval(id);
  }, [reducedMotion]);

  // Auto-typing search
  useEffect(() => {
    if (reducedMotion) {
      setSearchText(SEARCH_PHRASES[0]);
      return;
    }
    let phraseIdx = 0;
    let charIdx = 0;
    let typing = true;
    const tick = setInterval(() => {
      const target = SEARCH_PHRASES[phraseIdx];
      if (typing) {
        charIdx++;
        setSearchText(target.slice(0, charIdx));
        if (charIdx >= target.length) {
          typing = false;
          setTimeout(() => {}, 800);
        }
      } else {
        charIdx--;
        setSearchText(target.slice(0, charIdx));
        if (charIdx <= 0) {
          typing = true;
          phraseIdx = (phraseIdx + 1) % SEARCH_PHRASES.length;
        }
      }
    }, 90);
    return () => clearInterval(tick);
  }, [reducedMotion]);

  return (
    <div
      aria-hidden
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative h-[520px] sm:h-[580px] lg:h-[640px] flex items-center justify-center select-none [perspective:1200px]"
    >
      {/* Glow accent multicapa */}
      <div className="absolute inset-x-4 top-8 bottom-4 rounded-[3.5rem] bg-linear-to-br from-[var(--accent)]/[0.22] via-fuchsia-500/[0.08] to-amber-400/[0.12] blur-3xl" />
      <div className="absolute inset-x-12 top-16 bottom-12 rounded-[3rem] bg-linear-to-tr from-[var(--accent)]/[0.18] to-transparent blur-2xl" />

      {/* Pulso expansivo al entrar evento */}
      {!reducedMotion && (
        <m.div
          key={pulse}
          aria-hidden
          initial={{ scale: 0.92, opacity: 0.55 }}
          animate={{ scale: 1.2, opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="absolute inset-x-8 top-12 bottom-8 rounded-[3rem] border-2 border-[var(--accent)]/30 pointer-events-none"
        />
      )}

      {/* Frame del teléfono con 3D tilt */}
      <m.div
        style={{
          rotateX: tiltX,
          rotateY: tiltY,
          transformStyle: "preserve-3d",
        }}
        whileHover={reducedMotion ? undefined : { y: -4, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="relative h-full w-[260px] sm:w-[290px] lg:w-[320px] rounded-[2.75rem] bg-[var(--text-primary)] p-2 shadow-[var(--shadow-xl)] shadow-[var(--accent)]/20"
      >
        <div className="relative h-full w-full rounded-[2.25rem] bg-[var(--surface-canvas)] overflow-hidden">
          {/* Dynamic island */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 h-6 w-24 bg-[var(--text-primary)] rounded-full z-20" />

          {/* Header */}
          <div className="px-4 pt-12 pb-2 bg-linear-to-b from-[var(--accent)]/8 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Mi negocio · hoy
                </p>
                <p className="text-base font-black text-[var(--text-primary)] leading-tight mt-0.5">
                  Estás vendiendo
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-success)]/15 px-2 py-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand-success)] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-success)]" />
                </span>
                <span className="text-xs font-black text-[var(--brand-success)]">LIVE</span>
              </span>
            </div>
            {/* Search auto-typing */}
            <div className="mt-2.5 h-9 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] flex items-center px-3 text-xs text-[var(--text-secondary)] font-medium">
              <span className="mr-2 text-[var(--text-tertiary)] text-base">⌕</span>
              <span className="truncate">{searchText}</span>
              {!reducedMotion && (
                <m.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="ml-0.5 inline-block w-px h-3 bg-[var(--text-secondary)]"
                />
              )}
            </div>
          </div>

          {/* Contador grande + sparkline */}
          <div className="px-4 mt-1">
            <m.p
              key={Math.floor(sales / 100)}
              initial={{ y: -2, color: "var(--brand-success)" }}
              animate={{ y: 0, color: "var(--text-primary)" }}
              transition={{ duration: 0.5 }}
              className="text-[2.5rem] font-black tabular-nums tracking-[-0.04em] leading-none"
            >
              S/{" "}
              <NumberFlow value={sales} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
            </m.p>
            <div className="mt-1 flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-success)]/12 px-2 py-0.5">
                <TrendingUp className="h-3 w-3 text-[var(--brand-success)]" strokeWidth={2.5} />
                <span className="text-xs font-extrabold text-[var(--brand-success)]">+18% vs ayer</span>
              </div>
              {/* Sparkline */}
              <Sparkline points={SPARKLINE_POINTS} reducedMotion={reducedMotion} />
            </div>
          </div>

          {/* KPI cards */}
          <div className="px-4 mt-3 grid grid-cols-2 gap-2">
            <KpiCard kicker="Pedidos" value={42 + eventIdx} tone="bg-linear-to-br from-amber-400 to-orange-500" />
            <KpiCard kicker="Clientes" value={128 + eventIdx * 2} tone="bg-linear-to-br from-fuchsia-500 to-rose-500" />
          </div>

          {/* Bar chart "Ventas por hora" */}
          <div className="px-4 mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-extrabold text-[var(--text-primary)]">Por hora</p>
              <p className="text-xs font-bold text-[var(--text-tertiary)]">12h - 11p</p>
            </div>
            <HourlyBars values={HOURLY_BARS} reducedMotion={reducedMotion} />
          </div>

          {/* Tracker compacto */}
          <div className="px-4 mt-3">
            <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-3 py-2.5 flex items-center gap-2.5">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
                <Bike className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                    Marco · 12 min
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-success)]">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand-success)] opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-success)]" />
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-emerald-400 to-[var(--accent)] transition-[width] duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="absolute bottom-3 left-3 right-3 h-11 rounded-xl bg-[var(--accent)] text-white flex items-center justify-between px-4 shadow-[var(--shadow-lg)]">
            <span className="text-xs font-extrabold">Ver todos los pedidos</span>
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
          </div>

          {/* Toast stack — hasta 2 toasts visibles, el más nuevo arriba */}
          <div className="absolute top-12 left-3 right-3 z-30 pointer-events-none">
            <AnimatePresence>
              {toastStack.map((idx, stackPos) => {
                const e = EVENT_STREAM[idx];
                const meta = EVENT_META[e.kind];
                const ToastIcon = meta.Icon;
                return (
                  <m.div
                    key={`toast-${idx}-${stackPos}`}
                    initial={{ y: -50, opacity: 0, scale: 0.9 }}
                    animate={{
                      y: stackPos * 8,
                      opacity: stackPos === 0 ? 1 : 0.55,
                      scale: stackPos === 0 ? 1 : 0.94,
                    }}
                    exit={{ y: -30, opacity: 0, scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 360, damping: 26 }}
                    style={{ zIndex: 30 - stackPos }}
                    className="absolute inset-x-0 rounded-2xl bg-[var(--text-primary)] text-white px-3 py-2.5 shadow-2xl flex items-center gap-2.5 backdrop-blur"
                  >
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${meta.tone}`}>
                      <ToastIcon className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold opacity-80 leading-none">{e.title}</p>
                      <p className="text-sm font-black leading-tight mt-0.5 truncate">{e.subtitle}</p>
                    </div>
                    {e.amount && (
                      <span className="text-xs font-black text-[var(--brand-success)] shrink-0">
                        {e.amount}
                      </span>
                    )}
                    {e.kind === "review" && (
                      <span className="inline-flex items-center gap-0.5 text-amber-400 shrink-0">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-current" strokeWidth={1.5} />
                        ))}
                      </span>
                    )}
                  </m.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </m.div>

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
    <m.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      className="relative rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      <div className={`absolute -top-6 -right-6 h-16 w-16 rounded-full ${tone} opacity-40 blur-xl`} />
      <div className="relative px-2.5 py-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
            {kicker}
          </p>
          <span className="inline-flex items-center gap-0.5 text-xs font-black text-[var(--brand-success)]">
            <TrendingUp className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        </div>
        <p className="text-xl font-black tabular-nums tracking-tight text-[var(--text-primary)] mt-1 leading-none">
          <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
        </p>
      </div>
    </m.div>
  );
}

/* ── Bar chart de ventas por hora ──────────────────────────────────── */
function HourlyBars({
  values,
  reducedMotion,
}: {
  values: number[];
  reducedMotion: boolean;
}) {
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-1 h-12">
      {values.map((v, i) => {
        const pct = (v / max) * 100;
        const isPeak = v === max;
        return (
          <m.div
            key={i}
            initial={reducedMotion ? undefined : { height: 0 }}
            animate={reducedMotion ? undefined : { height: `${pct}%` }}
            transition={{
              duration: 0.5,
              delay: 0.05 * i,
              ease: "easeOut",
            }}
            style={!reducedMotion ? undefined : { height: `${pct}%` }}
            className={`flex-1 rounded-sm ${
              isPeak
                ? "bg-linear-to-t from-[var(--accent)] to-emerald-400"
                : "bg-[var(--accent)]/30"
            }`}
          />
        );
      })}
    </div>
  );
}

/* ── Sparkline mini-chart (sin lib externa) ─────────────────────────── */
function Sparkline({
  points,
  reducedMotion,
}: {
  points: number[];
  reducedMotion: boolean;
}) {
  const max = Math.max(...points);
  const w = 60;
  const h = 18;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - (p / max) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = (points.length - 1) * step;
  const lastY = h - (points[points.length - 1] / max) * h;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand-success)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <m.path
        d={path}
        fill="none"
        stroke="url(#spark-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reducedMotion ? undefined : { pathLength: 0 }}
        animate={reducedMotion ? undefined : { pathLength: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      />
      {/* Punto pulsante en el último valor */}
      <circle cx={lastX} cy={lastY} r="2" fill="var(--accent)" />
      {!reducedMotion && (
        <circle
          cx={lastX}
          cy={lastY}
          r="2"
          fill="var(--accent)"
          className="animate-ping origin-center"
          style={{ transformOrigin: `${lastX}px ${lastY}px` }}
        />
      )}
    </svg>
  );
}
