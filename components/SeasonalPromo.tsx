"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Tag, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Promo {
  emoji: string;
  title: string;
  subtitle: string;
  cta: string;
  category: string;
  gradient: string;
  accent: string;
}

const PROMOS: Promo[] = [
  {
    emoji: "🍊",
    title: "Frutas de Temporada",
    subtitle: "Las más frescas de la selva directo a tu mesa",
    cta: "Ver Frutas",
    category: "frutas-verduras",
    gradient: "linear-gradient(to right, #f97316, #fbbf24)",
    accent: "bg-orange-600",
  },
  {
    emoji: "🥩",
    title: "Carnes Premium",
    subtitle: "Cortes selectos al mejor precio de Pucallpa",
    cta: "Ver Carnes",
    category: "carnes",
    gradient: "linear-gradient(to right, #dc2626, #fb7185)",
    accent: "bg-red-700",
  },
  {
    emoji: "🧹",
    title: "Limpieza Total",
    subtitle: "Todo para tu hogar con hasta 15% de ahorro",
    cta: "Ver Ofertas",
    category: "limpieza",
    gradient: "linear-gradient(to right, #06b6d4, #60a5fa)",
    accent: "bg-indigo-600",
  },
  {
    emoji: "🍼",
    title: "Lácteos & Frescos",
    subtitle: "Leche, yogurt y quesos siempre frescos",
    cta: "Ver Lácteos",
    category: "lacteos",
    gradient: "linear-gradient(to right, #2d6a4f, #40916c)",
    accent: "bg-blue-600",
  },
];

const INTERVAL = 5000;

export default function SeasonalPromo() {
  const ref = useRef<HTMLElement>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setIdx((i) => (i + 1) % PROMOS.length), []);
  const prev = useCallback(() => setIdx((i) => (i - 1 + PROMOS.length) % PROMOS.length), []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, INTERVAL);
    return () => clearInterval(t);
  }, [paused, next]);

  const promo = PROMOS[idx];

  const handleCta = () => {
    const el = document.getElementById("productos");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("bsm:selectCategory", { detail: promo.category })
        );
      }, 400);
    }
  };

  return (
    <section
      ref={ref}
      className="relative overflow-hidden py-6 sm:py-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* bg gradient — inline style avoids Tailwind purge */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{ background: promo.gradient }}
      />

      {/* decorative circles */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-white/10" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-4">
        {/* left arrow */}
        <button
          onClick={prev}
          aria-label="Anterior promoción"
          className="hidden sm:flex shrink-0 w-10 h-10 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* content */}
        <div className="flex-1 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 text-white text-center sm:text-left">
          <span className="text-5xl sm:text-6xl drop-shadow-lg animate-[bounce_2s_ease-in-out_infinite]">
            {promo.emoji}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <Tag className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-white/80">
                Oferta de Temporada
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold leading-tight">
              {promo.title}
            </h3>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              {promo.subtitle}
            </p>
          </div>

          <button
            onClick={handleCta}
            className={cn(
              "shrink-0 flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm",
              "bg-white text-gray-900 hover:scale-105 active:scale-95 transition-transform shadow-lg"
            )}
          >
            {promo.cta}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* right arrow */}
        <button
          onClick={next}
          aria-label="Siguiente promoción"
          className="hidden sm:flex shrink-0 w-10 h-10 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* dots */}
      <div className="relative flex justify-center gap-2 mt-6">
        {PROMOS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Promoción ${i + 1}`}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              i === idx ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/60"
            )}
          />
        ))}
      </div>
    </section>
  );
}
