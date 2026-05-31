"use client";

/**
 * CategoriasShowcase — 3 cards editoriales tamaño grande con quotes
 * tipográficas, gradient distintivo y CTA prominente.
 *
 * Mismo lenguaje visual que BodegueroSpotlight:
 *   - Split 2 columnas (visual + texto)
 *   - Quote marks tipográficos
 *   - Tipografía black tracking-tight
 *   - Hover scale + rotate sutil
 *   - Gradients warm distintos por categoría
 *
 * Click → /marketplace/categoria/{slug}
 */

import Link from "next/link";
import { ArrowUpRight, Quote, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  ShoppingBasket,
  Leaf,
  ChefHat,
} from "@buleje/design-system/icons";

type ShowcaseCat = {
  slug: string;
  kicker: string;
  title: string;
  quote: string;
  cta: string;
  Icon: LucideIcon;
};

const SHOWCASES: ShowcaseCat[] = [
  {
    slug: "abarrotes",
    kicker: "Lo esencial",
    title: "Tu canasta del mes",
    quote: "Arroz, fideos, aceite, conservas — todo en una sola compra y a domicilio en 25 min.",
    cta: "Ver abarrotes",
    Icon: ShoppingBasket,
  },
  {
    slug: "frutas-verduras",
    kicker: "Frescos del día",
    title: "Frutas y verduras",
    quote: "Cosechado por productores de Ucayali. La frescura que necesitas para tu mesa.",
    cta: "Ver frescos",
    Icon: Leaf,
  },
  {
    slug: "carnes",
    kicker: "Del día",
    title: "Carnes y pollo",
    quote: "Pollo del día, res selecta, cerdo y embutidos — directo de carnicerías locales.",
    cta: "Ver carnes",
    Icon: ChefHat,
  },
];

export default function CategoriasShowcase() {
  return (
    <section
      aria-label="Categorias destacadas editorial"
      className="w-full py-8 sm:py-12"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6 pb-4 border-b border-[var(--rule-soft)]">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Editorial
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Categorías destacadas
          </h2>
          <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            Lo más buscado por las familias de Ciudad Constitución.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          {SHOWCASES.map((cat) => {
            const Icon = cat.Icon;
            return (
              <Link
                key={cat.slug}
                href={`/marketplace/categoria/${cat.slug}`}
                className={cn(
                  "group relative overflow-hidden rounded-2xl",
                  "border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
                  "transition-all duration-300 hover:-translate-y-1 hover:border-[var(--accent)]/30",
                  "hover:shadow-[0_12px_32px_-16px_color-mix(in oklab, var(--accent) 18%, transparent)]",
                )}
              >
                {/* Visual top — gradient surface sutil + dot accent */}
                <div className="relative h-44 sm:h-52 flex items-center justify-center bg-linear-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)] overflow-hidden">
                  {/* Decorative accent blob */}
                  <div
                    aria-hidden
                    className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-[var(--accent)]/5 blur-2xl transition-all duration-500 group-hover:bg-[var(--accent)]/15 group-hover:scale-110"
                  />
                  <span
                    className={cn(
                      "relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full",
                      "bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]",
                      "transition-all duration-300 group-hover:scale-105 group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]",
                    )}
                  >
                    <Icon className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.25} aria-hidden />
                  </span>
                  <ArrowUpRight
                    className="absolute top-4 right-4 h-5 w-5 text-[var(--text-tertiary)] transition-all duration-300 group-hover:rotate-12 group-hover:text-[var(--accent)]"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </div>

                {/* Editorial body */}
                <div className="px-6 py-6 sm:px-7 sm:py-7 border-t border-[var(--rule-soft)]">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
                    {cat.kicker}
                  </p>
                  <h3 className="text-xl sm:text-2xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    {cat.title}
                  </h3>
                  <div className="mt-3 flex gap-2">
                    <Quote
                      className="h-5 w-5 shrink-0 text-[var(--accent)]/30"
                      strokeWidth={1.25}
                      aria-hidden
                    />
                    <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                      {cat.quote}
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-primary)] group-hover:gap-2.5 transition-all">
                    {cat.cta}
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
