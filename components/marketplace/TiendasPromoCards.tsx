/**
 * TiendasPromoCards v2 (2026-05-10) — 2 cards promocionales con más
 * presencia visual: stat gigante, badge live, decoración geométrica y
 * acción inline. Antes eran cards planos con texto centrado.
 */

import Link from "next/link";
import { ArrowRight, Tag, Wallet } from "@buleje/design-system/icons";

interface PromoCard {
  href: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  /** Stat principal en el card (número grande). */
  stat: string;
  statLabel: string;
  /** Icono representativo a la izquierda. */
  icon: typeof Tag;
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
    stat: "-40%",
    statLabel: "Hoy",
    icon: Tag,
    variant: "accent",
  },
  {
    href: "/marketplace/como-pagar",
    eyebrow: "Yape o efectivo",
    title: "Pagá como prefieras",
    subtitle: "Sin tarjetas, sin complicaciones — vos decidís.",
    cta: "Cómo funciona",
    stat: "4",
    statLabel: "Métodos",
    icon: Wallet,
    variant: "ink",
  },
];

export default function TiendasPromoCards() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
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
  stat,
  statLabel,
  icon: Icon,
  variant,
  mobileHidden,
}: PromoCard & { mobileHidden?: boolean }) {
  const isAccent = variant === "accent";
  return (
    <Link
      href={href}
      className={[
        "group relative overflow-hidden rounded-2xl p-5 sm:p-7 min-h-[160px] sm:min-h-[200px]",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]",
        mobileHidden ? "hidden sm:block" : "block",
        isAccent
          ? "bg-[var(--accent-600,var(--accent))] text-white"
          : "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
      ].join(" ")}
    >
      {/* Mosaico geométrico decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/12 blur-2xl group-hover:bg-white/18 transition-colors"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-4 -bottom-12 h-32 w-32 rounded-full bg-white/8 blur-xl"
      />
      {/* Grid de puntos decorativos */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-4 top-4 h-12 w-12 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 1.5px, transparent 1.5px)",
          backgroundSize: "8px 8px",
        }}
      />

      <div className="relative h-full flex flex-col justify-between gap-3 sm:gap-4">
        {/* Header: icono + eyebrow */}
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur border border-white/20 shrink-0"
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
            </span>
            <p className="text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] opacity-85">
              {eyebrow}
            </p>
          </div>
          {/* Stat pill — solo desktop, número grande con label */}
          <div className="hidden sm:flex flex-col items-end shrink-0">
            <span className="text-2xl sm:text-3xl font-black tabular-nums tracking-[-0.03em] leading-none">
              {stat}
            </span>
            <span className="mt-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider opacity-70">
              {statLabel}
            </span>
          </div>
        </div>

        {/* Title + subtitle */}
        <div>
          <h3 className="text-xl sm:text-3xl font-black tracking-[-0.025em] leading-[1.05]">
            {title}
          </h3>
          <p className="hidden sm:block mt-2 text-sm sm:text-base opacity-85 max-w-[28ch] leading-snug">
            {subtitle}
          </p>
        </div>

        {/* CTA pill */}
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3.5 py-1.5 text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider self-start group-hover:gap-2 group-hover:bg-white/25 transition-all">
          {cta}
          <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}
