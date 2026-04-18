"use client";

/**
 * CrossSellFooter — Footer de cross-sell para paginas de categoria.
 *
 * Enlaza la pagina de una categoria con dos ecosistemas adyacentes:
 *   1) /marketplace/comparar — productos en comparacion (misma categoria).
 *   2) /recetas?categoria=slug — recetas que usan productos de esta categoria.
 *
 * Diseño: 2 columnas apiladas en mobile, side-by-side en desktop.
 * Tokens-only, 0 emojis. Usa ilustraciones monoline del DS.
 */

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  GitCompareArrows,
} from "@buleje/design-system/icons";
import { CardTitle, Caption, Kicker } from "@buleje/design-system";
import { CuadernoAbierto } from "@/components/ui-system/illustrations";
import { cn } from "@/lib/utils";

interface CrossSellFooterProps {
  /** Slug de la categoria actual (abarrotes, frutas-verduras, ...). */
  categorySlug: string;
  /** Label legible (para copy). */
  categoryLabel: string;
}

export default function CrossSellFooter({
  categorySlug,
  categoryLabel,
}: CrossSellFooterProps) {
  const cards = [
    {
      key: "compare",
      href: `/marketplace/comparar?categoria=${encodeURIComponent(categorySlug)}`,
      eyebrow: "Comparador",
      title: `Compara precios en ${categoryLabel}`,
      body: "El mismo producto puede costar distinto en cada bodega. Ve la tabla lado a lado.",
      Icon: GitCompareArrows,
      cta: "Abrir comparador",
    },
    {
      key: "recipes",
      href: `/recetas?categoria=${encodeURIComponent(categorySlug)}`,
      eyebrow: "Recetas",
      title: `Recetas con ${categoryLabel.toLowerCase()}`,
      body: "Ideas rapidas de la selva peruana usando productos de esta categoria.",
      Icon: BookOpen,
      cta: "Ver recetas",
    },
  ];

  return (
    <section
      aria-label={`Relacionado con ${categoryLabel}`}
      className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="mb-6">
          <Kicker className="text-[var(--text-tertiary)]">Relacionado</Kicker>
          <CardTitle
            as="h2"
            className="mt-1 text-[length:var(--ts-xl)]"
          >
            Explora mas sobre {categoryLabel}
          </CardTitle>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {cards.map((card) => {
            const { Icon } = card;
            return (
              <Link
                key={card.key}
                href={card.href}
                className={cn(
                  "group flex items-start gap-4 rounded-2xl border border-[var(--rule-base)]",
                  "bg-[var(--surface-canvas)] p-5 sm:p-6",
                  "transition-colors hover:border-[var(--rule-strong)]",
                )}
              >
                <div className="hidden sm:flex shrink-0 h-14 w-14 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                  {card.key === "recipes" ? (
                    <CuadernoAbierto size={40} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Kicker className="text-[var(--text-tertiary)]">
                    {card.eyebrow}
                  </Kicker>
                  <CardTitle className="mt-0.5 text-[length:var(--ts-lg)]">
                    {card.title}
                  </CardTitle>
                  <Caption className="mt-1 text-[var(--text-secondary)]">
                    {card.body}
                  </Caption>
                  <span className="mt-3 inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)]">
                    {card.cta}
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
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
