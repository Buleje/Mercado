"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Clock, ArrowUpRight } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Slide {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
}

const SLIDES: Slide[] = [
  {
    eyebrow: "Pucallpa · Ucayali",
    title: "La bodega de tu barrio, ahora en tu bolsillo",
    subtitle:
      "Abarrotes, bebidas y productos frescos. Entrega el mismo día. Pagás al recibir.",
    cta: "Explorar tiendas",
    href: "#tiendas",
  },
  {
    eyebrow: "Productos de la selva",
    title: "Açaí, camu camu, aguaje — directo del productor",
    subtitle:
      "Sabores de Ucayali seleccionados de familias locales. Entrega el mismo día.",
    cta: "Ver la selva",
    href: "#selva",
  },
  {
    eyebrow: "Cupón de bienvenida",
    title: "10% de descuento en tu primera compra",
    subtitle:
      "Código BIENVENIDO10 al pagar. Válido 24 horas para nuevos clientes.",
    cta: "Usar cupón",
    href: "#welcome-coupon",
  },
];

const INTERVAL = 7000;

export default function MarketplaceHeroBanner() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), INTERVAL);
    return () => clearInterval(id);
  }, [paused]);

  const slide = SLIDES[idx];

  return (
    <section
      aria-label="Destacados del marketplace"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="relative overflow-hidden border-b border-gray-100 dark:border-gray-900 bg-gray-50 dark:bg-gray-950"
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

      {/* Spot de color muy sutil (accent teal) */}
      <div
        aria-hidden="true"
        className="absolute -top-40 right-1/3 h-80 w-80 rounded-full bg-primary/[0.06] blur-[100px] pointer-events-none"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
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
                <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  {slide.eyebrow}
                </span>

                <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[56px] font-extrabold tracking-[-0.02em] leading-[1.05] text-gray-900 dark:text-white max-w-2xl">
                  {slide.title}
                </h1>

                <p className="mt-5 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl leading-relaxed">
                  {slide.subtitle}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-6">
                  <Link
                    href={slide.href}
                    className={cn(
                      "inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold",
                      "bg-gray-900 dark:bg-white text-white dark:text-gray-900",
                      "hover:bg-gray-800 dark:hover:bg-gray-100",
                      "transition-colors active:scale-[0.98]",
                    )}
                  >
                    {slide.cta}
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
                  </Link>

                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Entrega promedio 25 min
                  </span>
                </div>
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
                  <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-gray-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "h-px transition-all duration-500",
                      i === idx
                        ? "w-12 bg-gray-900 dark:bg-white"
                        : "w-6 bg-gray-300 dark:bg-gray-700 group-hover:bg-gray-500",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Right column — editorial meta card */}
          <aside className="hidden lg:block">
            <div className="relative rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 noise-bg">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400">
                Edición actual
              </div>
              <div className="mt-3 text-[120px] leading-none font-extrabold text-gray-900 dark:text-white tabular-nums tracking-tighter">
                {String(idx + 1).padStart(2, "0")}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {slide.eyebrow.split("·")[0].trim()}
                </span>
                <span className="text-[length:var(--ts-2xs)] text-gray-400 tabular-nums">
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
