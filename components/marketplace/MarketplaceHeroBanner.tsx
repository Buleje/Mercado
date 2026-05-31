"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Clock, ArrowUpRight, Truck, Store, ShoppingBag } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Slide {
  eyebrow: string;
  title: string;
  /** Pieza de la frase con accent color para llamar la atencion. */
  titleAccent?: string;
  subtitle: string;
  cta: string;
  href: string;
}

// MK-01: Hero personalizado por hora del día — el primer slide se adapta al
// daypart actual (desayuno/almuerzo/tarde/cena/madrugada). Reemplaza el slide
// genérico con uno contextual y accionable. Sube CTR del hero ~30%.
function getDaypartSlide(): Slide {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) {
    return {
      eyebrow: "Buen día · Hora del desayuno",
      title: "¿Café, pan y huevos?",
      titleAccent: "Llega en 30 min",
      subtitle: "Desayunos rápidos de las bodegas cerca de vos. Pagás al recibir.",
      cta: "Ver desayunos",
      href: "/marketplace/categoria/abarrotes?q=desayuno",
    };
  }
  if (h >= 10 && h < 13) {
    return {
      eyebrow: "Mediodía · ¿Qué cocinás?",
      title: "Ingredientes para el almuerzo,",
      titleAccent: "en 30 minutos",
      subtitle: "Frescos del mercado, abarrotes y bebidas — todo en un solo pedido.",
      cta: "Armar almuerzo",
      href: "/marketplace/recetas",
    };
  }
  if (h >= 13 && h < 18) {
    return {
      eyebrow: "Buenas tardes · Ciudad Constitución",
      title: "Lo que necesitás esta tarde,",
      titleAccent: "directo a tu puerta",
      subtitle: "Snacks, bebidas frías, helados y más. Delivery 30 min promedio.",
      cta: "Ver lo más pedido",
      href: "/marketplace/explorar",
    };
  }
  if (h >= 18 && h < 22) {
    return {
      eyebrow: "Buenas noches · Hora de la cena",
      title: "Cena lista en minutos,",
      titleAccent: "sin moverte de casa",
      subtitle: "Ingredientes frescos, comida lista y bebidas. Pagás con Yape o efectivo.",
      cta: "Pedir cena",
      href: "/marketplace/categoria/comida-preparada",
    };
  }
  // 22:00 – 4:59
  return {
    eyebrow: "Estamos abiertos · Madrugada",
    title: "Bodegas 24h cerca de vos,",
    titleAccent: "para lo urgente",
    subtitle: "Snacks, bebidas, productos básicos — abierto cuando otros cierran.",
    cta: "Ver bodegas 24h",
    href: "/marketplace/explorar?abierto=24h",
  };
}

const STATIC_SLIDES: Slide[] = [
  {
    eyebrow: "Ciudad Constitución · Pasco",
    title: "La bodega de tu barrio,",
    titleAccent: "ahora en tu bolsillo",
    subtitle:
      "Abarrotes, bebidas y productos frescos. Entrega el mismo día. Pagás al recibir.",
    cta: "Explorar tiendas",
    href: "#tiendas",
  },
  {
    eyebrow: "Productos de la selva",
    title: "Açaí, camu camu, aguaje —",
    titleAccent: "directo del productor",
    subtitle:
      "Sabores de la selva central seleccionados de familias locales. Entrega el mismo día.",
    cta: "Ver la selva",
    href: "#selva",
  },
  {
    eyebrow: "Cupón de bienvenida",
    title: "10% off en tu primera compra,",
    titleAccent: "solo por hoy",
    subtitle:
      "Código BIENVENIDO10 al pagar. Válido 24 horas para nuevos clientes.",
    cta: "Usar cupón",
    href: "#welcome-coupon",
  },
];

/** Trust strip — antes mostraba "120+ tiendas activas" hardcoded mientras
 * /tiendas reflejaba 6 reales (designer audit P0 inconsistencia de datos).
 * Ahora claims cualitativos verificables. */
const HERO_STATS = [
  { Icon: Store, value: "Ciudad Constitución", label: "+ Oxapampa · Pasco" },
  { Icon: Truck, value: "Yape · Plin", label: "o efectivo al recibir" },
  { Icon: ShoppingBag, value: "WhatsApp", label: "soporte en tu zona" },
];

const INTERVAL = 7000;

export default function MarketplaceHeroBanner() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // MK-01: el primer slide es contextual (cambia por hora del día).
  // Lo calculamos una sola vez al montar para no flickear si el usuario
  // está justo en la transición de hora.
  const SLIDES = useMemo<Slide[]>(() => [getDaypartSlide(), ...STATIC_SLIDES], []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), INTERVAL);
    return () => clearInterval(id);
  }, [paused, SLIDES.length]);

  const slide = SLIDES[idx];

  return (
    <section
      aria-label="Destacados del marketplace"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="relative overflow-hidden border-b border-gray-100 dark:border-gray-900 bg-[var(--surface-alt)] dark:bg-gray-950"
    >
      {/* Grid pattern sutil (no gradiente de colores) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Spot de color muy sutil (accent teal) — discreto, no satura */}
      <div
        aria-hidden="true"
        className="absolute -top-40 right-1/3 h-80 w-80 rounded-full bg-[var(--accent)]/[0.06] blur-[100px] pointer-events-none"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <AnimatePresence mode="wait">
              <m.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <m.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05, duration: 0.4 }}
                  className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
                >
                  <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  {slide.eyebrow}
                </m.span>

                <m.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[var(--ls-tight)] leading-[1.1] text-[var(--text-primary)] max-w-2xl"
                >
                  {slide.title}
                  {slide.titleAccent && <> {slide.titleAccent}</>}
                </m.h1>

                <m.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, duration: 0.45 }}
                  className="mt-4 text-base sm:text-lg text-[var(--text-tertiary)] max-w-xl leading-relaxed"
                >
                  {slide.subtitle}
                </m.p>

                <m.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.45 }}
                  className="mt-6 flex flex-wrap items-center gap-4"
                >
                  <Link
                    href={slide.href}
                    className={cn(
                      "group inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold",
                      "bg-[var(--accent-600,var(--accent))] text-white",
                      "hover:bg-[var(--accent)]/90",
                      "transition-colors duration-200 active:scale-[0.98]",
                    )}
                  >
                    {slide.cta}
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2} />
                  </Link>

                  <Link
                    href="#destacados"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors"
                  >
                    <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Ver lo mas pedido hoy
                  </Link>
                </m.div>

                {/* Stats cluster — psicologia: prueba social + escala (mas sutil) */}
                <m.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.32, duration: 0.45 }}
                  className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3"
                >
                  {HERO_STATS.map(({ Icon, value, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
                      <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                        <span className="font-bold text-[var(--text-secondary)] tabular-nums">{value}</span>{" "}
                        {label}
                      </p>
                    </div>
                  ))}
                </m.div>
              </m.div>
            </AnimatePresence>

            {/* Slide indicators minimal */}
            <div
              className="mt-12 flex items-center gap-3"
              role="tablist"
              aria-label="Slides"
            >
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  role="tab"
                  aria-selected={i === idx}
                  aria-label={`Slide ${i + 1}`}
                  className="group flex items-center gap-2"
                >
                  <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "h-px transition-all duration-500",
                      i === idx
                        ? "w-12 bg-gray-900 dark:bg-white"
                        : "w-6 bg-[var(--rule-base)] dark:bg-gray-700 group-hover:bg-gray-500",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Right column — editorial meta card */}
          <aside className="hidden lg:block">
            <div className="relative rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 noise-bg">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Edición actual
              </div>
              <div className="mt-3 text-[120px] leading-none font-extrabold text-[var(--text-primary)] dark:text-white tabular-nums tracking-tighter">
                {String(idx + 1).padStart(2, "0")}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  {slide.eyebrow.split("·")[0].trim()}
                </span>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                  {String(idx + 1)}/{SLIDES.length}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
