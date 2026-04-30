"use client";

import { useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import {
  Flame,
  Sparkles,
  Leaf,
  Gift,
  ChefHat,
  TrendingUp,
  Clock,
  Percent,
  Heart,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import StoriesViewer, { type StorySlide } from "@/components/marketplace/StoriesViewer";

interface StoryChip {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  featured?: boolean;
}

const STORIES: StoryChip[] = [
  { id: "ofertas", label: "Ofertas", icon: Percent, href: "/marketplace?filtro=ofertas", featured: true },
  { id: "nuevos", label: "Nuevos", icon: Sparkles, href: "/marketplace?filtro=nuevos" },
  { id: "top", label: "Top hoy", icon: Flame, href: "#top-today", featured: true },
  { id: "selva", label: "De la selva", icon: Leaf, href: "#selva" },
  { id: "recetas", label: "Recetas", icon: ChefHat, href: "#recetas" },
  { id: "express", label: "Express 20 min", icon: Clock, href: "/marketplace?filtro=express" },
  { id: "bienvenida", label: "Cupón", icon: Gift, href: "#welcome-coupon" },
  { id: "tendencias", label: "Tendencia", icon: TrendingUp, href: "/marketplace?filtro=tendencia" },
  { id: "favoritos", label: "Favoritos", icon: Heart, href: "/marketplace/favoritos" },
];

const STORY_PRESENTATIONS: Record<string, { title: string; slides: StorySlide[] }> = {
  ofertas: {
    title: "Ofertas de hoy",
    slides: [
      {
        id: "o1",
        headline: "Hasta 40% OFF",
        subheadline: "En abarrotes, bebidas y limpieza — solo por hoy.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Ver ofertas",
        ctaHref: "/marketplace?vista=catalogo&sort=popular",
      },
      {
        id: "o2",
        headline: "2×1 en combos de bodega",
        subheadline: "Llevate dos al precio de uno. Mientras dure el stock.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Aprovechar",
        ctaHref: "/marketplace?vista=catalogo",
      },
      {
        id: "o3",
        headline: "Envío gratis desde S/50",
        subheadline: "En todos los pedidos del marketplace Pucallpa.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Empezar",
        ctaHref: "/marketplace",
      },
    ],
  },
  selva: {
    title: "Productos de la selva",
    slides: [
      {
        id: "s1",
        headline: "Del árbol a tu mesa",
        subheadline: "Aguaje, camu camu, açaí y castañas directo de Ucayali.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Explorar selva",
        ctaHref: "#selva",
      },
      {
        id: "s2",
        headline: "Productores locales",
        subheadline: "Apoyás a familias de la Amazonía peruana en cada compra.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Conocer más",
        ctaHref: "#selva",
      },
    ],
  },
  bienvenida: {
    title: "Tu cupón",
    slides: [
      {
        id: "b1",
        headline: "10% OFF en tu 1ra compra",
        subheadline: "Código BIENVENIDO10 — válido 24 horas solamente.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Usar cupón",
        ctaHref: "#welcome-coupon",
      },
      {
        id: "b2",
        headline: "¿Cómo aplicarlo?",
        subheadline: "Copialo en el checkout y el descuento se activa solo.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Empezar a comprar",
        ctaHref: "/marketplace",
      },
    ],
  },
  recetas: {
    title: "Recetas de la selva",
    slides: [
      {
        id: "r1",
        headline: "Juane de gallina",
        subheadline: "El clásico de San Juan. Armamos la lista completa por ti.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Ver receta",
        ctaHref: "#recetas",
      },
      {
        id: "r2",
        headline: "Tacacho con cecina",
        subheadline: "Desayuno típico amazónico en 45 minutos.",
        bg: "from-zinc-900 to-zinc-800",
        ctaLabel: "Todas las recetas",
        ctaHref: "/marketplace/recetas",
      },
    ],
  },
};

export default function MarketplaceStories() {
  const [activeStory, setActiveStory] = useState<string | null>(null);
  const presentation = activeStory ? STORY_PRESENTATIONS[activeStory] : null;

  return (
    <section
      aria-label="Accesos rápidos"
      className="bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <m.div
          className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.03, delayChildren: 0.05 },
            },
          }}
        >
          {STORIES.map((s) => {
            const Icon = s.icon;
            const isAnchor = s.href.startsWith("#");
            const hasPresentation = Boolean(STORY_PRESENTATIONS[s.id]);

            const inner = (
              <m.div
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  show: { opacity: 1, y: 0 },
                }}
                className={cn(
                  "inline-flex items-center gap-2 shrink-0 px-3.5 py-2 rounded-full border text-xs font-semibold transition-all",
                  "whitespace-nowrap",
                  s.featured
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-[var(--text-primary)] hover:opacity-90"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                )}
              >
                <Icon
                  className="h-3.5 w-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {s.label}
              </m.div>
            );

            if (hasPresentation) {
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveStory(s.id)}
                  aria-label={s.label}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
                >
                  {inner}
                </button>
              );
            }
            if (isAnchor) {
              return (
                <a key={s.id} href={s.href} aria-label={s.label}>
                  {inner}
                </a>
              );
            }
            return (
              <Link key={s.id} href={s.href} aria-label={s.label}>
                {inner}
              </Link>
            );
          })}
        </m.div>
      </div>

      {presentation && (
        <StoriesViewer
          open={activeStory !== null}
          onOpenChange={(v) => !v && setActiveStory(null)}
          slides={presentation.slides}
          title={presentation.title}
        />
      )}
    </section>
  );
}
