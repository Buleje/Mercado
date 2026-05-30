"use client";

/**
 * ExplorarSectionPortals — Grid de portales de navegación.
 *
 * Tono unificado neutro con acento brand. NO rainbow — la jerarquía la
 * marca la tipografía + la composición bento + el accent solo donde
 * cuenta. Featured cards tienen un mood (cálido/frío) muy sutil.
 */

import Link from "next/link";
import {
  Store,
  Tag,
  Percent,
  Lightbulb,
  Bot,
  Gift,
  Map,
  Flame,
  ArrowUpRight,
  type LucideIcon,
} from "@buleje/design-system/icons";

type Variant = "hero-brand" | "hero-warm" | "neutral";

interface Portal {
  href: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  preview: string[];
  cta: string;
  variant: Variant;
}

const HERO_BRAND: Portal = {
  href: "/marketplace",
  icon: Store,
  eyebrow: "Tu mercado",
  title: "Encontrá tu bodega favorita",
  description:
    "Cientos de tiendas de Pucallpa, una sola app. Comprá lo de siempre cerca de tu casa o descubrí algo nuevo.",
  preview: ["Pollerías", "Minimarkets", "Mayoristas", "Fruterías", "Veterinarias"],
  cta: "Ver bodegas",
  variant: "hero-brand",
};

const HERO_WARM: Portal = {
  href: "/marketplace/ofertas",
  icon: Percent,
  eyebrow: "Solo por hoy",
  title: "Ofertas activas",
  description: "Combos, 2×1, liquidación. Los precios vuelan — si te gusta, agarralo.",
  preview: ["−30% lácteos", "Combos", "2×1"],
  cta: "Ver ofertas",
  variant: "hero-warm",
};

const PORTALS: Portal[] = [
  {
    href: "/tiendas",
    icon: Tag,
    eyebrow: "Filtros",
    title: "Por categoría",
    description: "Filtrá por tipo de negocio.",
    preview: ["Restaurantes", "Limpieza", "Carnes"],
    cta: "Explorar",
    variant: "neutral",
  },
  {
    href: "/recetas",
    icon: Lightbulb,
    eyebrow: "Ideas",
    title: "Recetas",
    description: "Ideas con ingredientes que vendemos.",
    preview: ["Almuerzos", "Postres", "Snacks"],
    cta: "Ver recetas",
    variant: "neutral",
  },
  {
    href: "/asistente",
    icon: Bot,
    eyebrow: "Buleje IA",
    title: "Asistente",
    description: "Hablale, te arma la lista del mercado.",
    preview: ["Lista semanal", "Mejor precio", "Cerca"],
    cta: "Probar",
    variant: "neutral",
  },
  {
    href: "/marketplace/gift-cards",
    icon: Gift,
    eyebrow: "Regalos",
    title: "Gift cards",
    description: "Regalá Buleje, ellos eligen.",
    preview: ["S/50", "S/100", "S/200"],
    cta: "Comprar",
    variant: "neutral",
  },
  {
    href: "/tiendas?zone=true",
    icon: Map,
    eyebrow: "Ubicación",
    title: "Por zona",
    description: "Bodegas cerca de tu casa.",
    preview: ["Manantay", "Yarinacocha", "Callería"],
    cta: "Filtrar",
    variant: "neutral",
  },
  {
    href: "/marketplace/en-vivo",
    icon: Flame,
    eyebrow: "Trending",
    title: "Lo que se vende",
    description: "Top productos del momento.",
    preview: ["Top 10", "Trending", "Nuevos"],
    cta: "Ver",
    variant: "neutral",
  },
];

export default function ExplorarSectionPortals() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      {/* Section heading — minimal, no compite con hero */}
      <div className="mb-8 sm:mb-12 flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-xl">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
            Destinos disponibles
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Elegí tu próximo destino
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Cada portal te lleva al catálogo completo. Acá solo un asomo de lo que hay.
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
          <span className="text-base font-extrabold text-[var(--accent)] tabular-nums leading-none">
            8
          </span>
          secciones disponibles
        </span>
      </div>

      {/* Bento mosaic */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <FeaturedCard portal={HERO_BRAND} className="lg:col-span-2 lg:row-span-2" big />
        <FeaturedCard portal={HERO_WARM} className="lg:col-span-2" />
        {PORTALS.map((p) => (
          <NeutralCard key={p.href} portal={p} />
        ))}
      </div>
    </section>
  );
}

/* ────────── Featured (brand or warm) ────────── */
function FeaturedCard({
  portal,
  className = "",
  big = false,
}: {
  portal: Portal;
  className?: string;
  big?: boolean;
}) {
  const Icon = portal.icon;
  const isBrand = portal.variant === "hero-brand";

  // Vender editorial: superficies planas, sin gradientes ni rainbow.
  // La card brand conserva un susurro de accent; el resto va neutro.
  const cardBg = isBrand ? "bg-[var(--accent)]/[0.04]" : "bg-[var(--surface-raised)]";

  const iconBg = isBrand
    ? "bg-[var(--accent)] text-white"
    : "bg-[var(--surface-sunken)] text-[var(--text-primary)]";

  const chipBg =
    "bg-[var(--surface-canvas)] text-[var(--text-secondary)] border-[var(--rule-soft)]";

  const ctaBg = isBrand
    ? "bg-[var(--accent)] text-white hover:brightness-110"
    : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]";

  return (
    <Link
      href={portal.href}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--rule-base)] p-6 sm:p-7 transition-all hover:border-[var(--rule-strong)] hover:shadow-md ${cardBg} ${className}`}
    >
      {/* Top row — solo el ícono, sin tag flotante redundante */}
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl ${iconBg} transition-transform group-hover:scale-105`}
        >
          <Icon
            className={big ? "h-6 w-6 sm:h-7 sm:w-7" : "h-5 w-5 sm:h-6 sm:w-6"}
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
      </div>

      {/* Body */}
      <div className="relative mt-6 sm:mt-8">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
          {portal.eyebrow}
        </p>
        <h3
          className={`${
            big ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
          } font-extrabold tracking-tight text-[var(--text-primary)] leading-tight`}
        >
          {portal.title}
        </h3>
        <p
          className={`mt-2 ${big ? "text-base sm:text-lg" : "text-sm"} text-[var(--text-secondary)] leading-relaxed max-w-md`}
        >
          {portal.description}
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {portal.preview.map((p) => (
            <span
              key={p}
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${chipBg}`}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="relative mt-6 sm:mt-8">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-sm font-bold tracking-tight transition-all group-hover:gap-2.5 ${ctaBg}`}
        >
          {portal.cta}
          <ArrowUpRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.5}
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}

/* ────────── Neutral cards ────────── */
function NeutralCard({ portal }: { portal: Portal }) {
  const Icon = portal.icon;
  return (
    <Link
      href={portal.href}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 transition-all hover:border-[var(--rule-strong)] hover:shadow-md"
    >
      <div className="relative">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-primary)] transition-all group-hover:bg-[var(--accent)] group-hover:text-white">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>

      <div className="relative mt-4">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]">
          {portal.eyebrow}
        </p>
        <h3 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {portal.title}
        </h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
          {portal.description}
        </p>

        <div className="mt-3 flex flex-wrap gap-1">
          {portal.preview.slice(0, 3).map((p) => (
            <span
              key={p}
              className="inline-flex items-center rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-5">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold tracking-tight text-[var(--text-primary)] transition-all group-hover:gap-2.5 group-hover:text-[var(--accent)]">
          {portal.cta}
          <ArrowUpRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.5}
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
