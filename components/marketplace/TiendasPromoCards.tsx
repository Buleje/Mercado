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

export default function TiendasPromoCards({ hasOffers }: { hasOffers?: boolean }) {
  const visibleCards = hasOffers === false
    ? CARDS.filter((c) => c.variant !== "accent")
    : CARDS;

  // Brandon, mayo 14 2026:
  //  - La card "Yape o efectivo · Pagá como prefieras" (variant ink) ya no
  //    se oculta en mobile cuando es la única visible — antes mobileHidden
  //    la escondia y dejaba el slot vacío.
  //  - Si solo hay 1 card visible (caso: no hay ofertas), el grid colapsa
  //    a 1 columna full-width tanto mobile como desktop — antes en sm+
  //    quedaba un hueco vacío a la derecha porque el grid pedía 2 cols.
  const singleCard = visibleCards.length === 1;
  // Las cards visibles rellenan TODO el ancho: 1→full, 2→mitades, 3+→tercios.
  // Antes quedaba siempre en 2 cols y con 3 cards dejaba un hueco a la derecha.
  const gridCols = singleCard
    ? "grid-cols-1"
    : visibleCards.length === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
      <div className={`grid ${gridCols} gap-3 sm:gap-4`}>
        {visibleCards.map((c) => (
          <PromoCardItem
            key={c.href}
            {...c}
            // Sólo ocultamos en mobile cuando coexiste con otra card.
            // Si es la única (hasOffers=false), siempre la mostramos —
            // el cliente vino a ver algo, no a ver un hueco.
            mobileHidden={!singleCard && c.variant === "ink"}
            wide={singleCard}
          />
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
  wide,
}: PromoCard & { mobileHidden?: boolean; wide?: boolean }) {
  const isAccent = variant === "accent";
  return (
    <Link
      href={href}
      className={[
        "group relative overflow-hidden rounded-2xl p-5 sm:p-7",
        wide
          ? "min-h-[140px] sm:min-h-[180px]"
          : "min-h-[160px] sm:min-h-[200px]",
        "transition-all duration-[var(--dur-base)] hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]",
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
        className={[
          "pointer-events-none absolute opacity-40",
          wide
            ? "right-8 top-1/2 -translate-y-1/2 h-24 w-24 hidden sm:block"
            : "right-4 top-4 h-12 w-12",
        ].join(" ")}
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 1.5px, transparent 1.5px)",
          backgroundSize: "8px 8px",
        }}
      />

      {/* Layout: stacked (default) o horizontal-editorial (wide en desktop).
          Brandon mayo 14 2026: cuando es el único card visible (sin ofertas),
          el grid colapsa a 1 col y la card usa layout horizontal en sm+ para
          aprovechar el ancho extra. Antes quedaba un hueco vacío a la derecha. */}
      <div
        className={
          wide
            ? "relative h-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-8"
            : "relative h-full flex flex-col justify-between gap-3 sm:gap-4"
        }
      >
        <div className={wide ? "flex-1 min-w-0" : "contents"}>
          {/* Header: icono + eyebrow */}
          <div className="flex items-start justify-between gap-3">
            <div className="inline-flex items-center gap-2.5">
              <span
                aria-hidden
                className={[
                  "inline-flex items-center justify-center rounded-xl bg-white/15 backdrop-blur border border-white/20 shrink-0",
                  wide ? "h-11 w-11 sm:h-12 sm:w-12" : "h-9 w-9 sm:h-11 sm:w-11",
                ].join(" ")}
              >
                <Icon
                  className={wide ? "h-5 w-5 sm:h-6 sm:w-6" : "h-4 w-4 sm:h-5 sm:w-5"}
                  strokeWidth={2.25}
                />
              </span>
              <p className="text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] opacity-85">
                {eyebrow}
              </p>
            </div>
            {/* Stat pill — sólo en modo stacked. En wide va al bloque derecho. */}
            {!wide && (
              <div className="hidden sm:flex flex-col items-end shrink-0">
                <span className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-[-0.03em] leading-none">
                  {stat}
                </span>
                <span className="mt-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider opacity-70">
                  {statLabel}
                </span>
              </div>
            )}
          </div>

          {/* Title + subtitle */}
          <div className={wide ? "mt-3 sm:mt-2" : ""}>
            <h3
              className={
                wide
                  ? "text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.02]"
                  : "text-xl sm:text-3xl font-extrabold tracking-tight leading-[1.05]"
              }
            >
              {title}
            </h3>
            <p
              className={
                wide
                  ? "mt-2 sm:mt-3 text-sm sm:text-lg opacity-85 leading-snug max-w-[60ch]"
                  : "hidden sm:block mt-2 text-sm sm:text-base opacity-85 max-w-[28ch] leading-snug"
              }
            >
              {subtitle}
            </p>
          </div>

          {/* CTA — sólo stacked. En wide va al bloque derecho. */}
          {!wide && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3.5 py-1.5 text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider self-start group-hover:gap-2 group-hover:bg-white/25 transition-all">
              {cta}
              <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} />
            </span>
          )}
        </div>

        {/* Bloque derecho — solo en modo wide: stat grande + CTA gruesa */}
        {wide && (
          <div className="flex items-center gap-4 sm:gap-6 sm:flex-col sm:items-end shrink-0">
            <div className="flex flex-col items-start sm:items-end">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tabular-nums tracking-[-0.03em] leading-none">
                {stat}
              </span>
              <span className="mt-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider opacity-70">
                {statLabel}
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 text-[var(--text-primary)] px-4 sm:px-5 h-10 sm:h-11 text-sm font-extrabold uppercase tracking-wider shrink-0 group-hover:gap-2.5 transition-all shadow-md">
              {cta}
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
