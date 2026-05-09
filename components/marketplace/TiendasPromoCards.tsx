"use client";

/**
 * TiendasPromoCards — 2 cards promocionales lado a lado al estilo PedidosYa
 * pero con paleta Buleje (teal accent + neutral oscuro). Minimalistas, sin
 * stock photos pesadas: usan formas geométricas + tipografía marca.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface PromoCard {
  href: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  /** Tema de color del card */
  variant: "accent" | "ink";
}

const CARDS: PromoCard[] = [
  {
    href: "/marketplace/ofertas",
    eyebrow: "Ofertas del barrio",
    title: "Ahorrá hasta 40%",
    subtitle: "En bodegas seleccionadas todos los días.",
    cta: "Ver ofertas",
    variant: "accent",
  },
  {
    href: "/marketplace/como-pagar",
    eyebrow: "Yape o efectivo",
    title: "Pagá como prefieras",
    subtitle: "Sin tarjetas, sin complicaciones — vos decidís.",
    cta: "Cómo funciona",
    variant: "ink",
  },
];

export default function TiendasPromoCards() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
      {/* En mobile: solo 1 card (la accent — descuentos) y compacta.
          En sm+: 2 cards completas. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {CARDS.map((c, i) => (
          <PromoCardItem key={c.href} {...c} mobileHidden={i === 1} />
        ))}
      </div>
    </section>
  );
}

function PromoCardItem({
  href,
  eyebrow,
  title,
  subtitle,
  cta,
  variant,
  mobileHidden,
}: PromoCard & { mobileHidden?: boolean }) {
  const isAccent = variant === "accent";
  return (
    <Link
      href={href}
      className={[
        "group relative overflow-hidden rounded-2xl p-4 sm:p-7",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        mobileHidden ? "hidden sm:block" : "block",
        isAccent
          ? "bg-[var(--accent-600,var(--accent))] text-white"
          : "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
      ].join(" ")}
    >
      {/* Decoración geométrica suave */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-4 -bottom-12 h-28 w-28 rounded-full bg-white/5"
      />

      <p className="text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] opacity-80 mb-1 sm:mb-2">
        {eyebrow}
      </p>
      <h3 className="text-lg sm:text-3xl font-black tracking-[var(--ls-tight)] leading-[1.05]">
        {title}
      </h3>
      {/* Subtitle: oculto en mobile para reducir altura del card */}
      <p className="hidden sm:block mt-2 text-sm sm:text-base opacity-90 max-w-[28ch] leading-snug">
        {subtitle}
      </p>
      <span className="mt-3 sm:mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 sm:px-3.5 py-1 sm:py-1.5 text-[length:var(--ts-xs)] sm:text-xs font-bold group-hover:gap-2.5 group-hover:bg-white/25 transition-all">
        {cta}
        <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} />
      </span>
    </Link>
  );
}
