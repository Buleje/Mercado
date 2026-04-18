"use client";

import Link from "next/link";
import {
  ArrowRight,
  Gift,
  HeartHandshake,
  Package,
  Flashlight,
  Sparkles,
  GitCompareArrows,
  Store,
  BadgePercent,
  Ticket,
  ChefHat,
  Truck,
  HelpCircle,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  Kicker,
  SectionTitle,
  CardTitle,
  BodyText,
  IconBadge,
} from "@buleje/design-system";
import type { FeatureCard } from "@/lib/navigation/feature-registry";

/**
 * Icon registry local — mapea el string del registry al componente.
 * Mantener alineado con los iconos usados en feature-registry.ts.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  Gift,
  HeartHandshake,
  Package,
  Flashlight,
  Sparkles,
  GitCompareArrows,
  Store,
  BadgePercent,
  Ticket,
  ChefHat,
  Truck,
  HelpCircle,
};

type Props = {
  /** Features a mostrar. Max 3. */
  features: FeatureCard[];
  /** Kicker override. Default: "Descubrí más". */
  kicker?: string;
  /** Título override. Default: "Todo lo que podés hacer con Buleje". */
  title?: string;
  /** Classes extra para el wrapper. */
  className?: string;
};

/**
 * <RelatedFeatures> — Bloque horizontal de cross-link al final de una página.
 *
 * Renderiza máximo 3 cards. Si se pasan más, se trunca.
 * Usa tokens del DS: --surface-canvas, --rule-muted, --text-*.
 *
 * Integración típica:
 *   <RelatedFeatures features={relatedFor("gift-cards")} />
 */
export default function RelatedFeatures({
  features,
  kicker = "Descubrí más",
  title = "Todo lo que podés hacer con Buleje",
  className,
}: Props) {
  const list = features.slice(0, 3);
  if (list.length === 0) return null;

  return (
    <section
      aria-labelledby="related-features-title"
      className={[
        "border-t border-[var(--rule-muted)] bg-[var(--surface-canvas)]",
        className ?? "",
      ].join(" ")}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <header className="mb-8 max-w-2xl">
          <Kicker className="mb-2 block">{kicker}</Kicker>
          <SectionTitle id="related-features-title">{title}</SectionTitle>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((feat) => {
            const Icon = ICON_MAP[feat.icon] ?? Sparkles;
            return (
              <Link
                key={feat.id}
                href={feat.href}
                aria-label={`${feat.title} — ${feat.cta}`}
                className="group relative block rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] p-5 transition-colors hover:border-[var(--rule-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <div className="flex items-start gap-4">
                  <IconBadge size="md" shape="square" intent="muted">
                    <Icon
                      className="h-4 w-4"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </IconBadge>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="mb-1">{feat.title}</CardTitle>
                    <BodyText className="text-[var(--text-secondary)] line-clamp-2">
                      {feat.description}
                    </BodyText>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    {feat.cta}
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2}
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
