"use client";

/**
 * PersonalizedRecommendations — seccion "Podes aprovechar" del dashboard.
 *
 * 2-3 sugerencias inteligentes segun estado del user:
 *   - intent "urgent" -> gift card pendiente, cupon por vencer
 *   - intent "schedule" -> próxima entrega Bodega al Mes
 *   - intent "upgrade" -> si no es Socio
 *   - intent "suggestion" -> cupones disponibles, ofertas
 */

import { memo } from "react";
import Link from "next/link";
import {
  Kicker,
  SectionTitle,
  CardTitle,
  BodyText,
  IconBadge,
} from "@buleje/design-system";
import {
  Clock,
  CalendarClock,
  Sparkles,
  TrendingUp,
  ArrowRight,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type {
  CustomerDashboardData,
  RecommendationIntent,
} from "@/lib/customer-dashboard.mock";
import { cn } from "@/lib/utils";

export interface PersonalizedRecommendationsProps {
  data: CustomerDashboardData;
}

const INTENT_META: Record<
  RecommendationIntent,
  { icon: LucideIcon; tone: string; label: string }
> = {
  urgent: {
    icon: Clock,
    tone: "warning",
    label: "Urgente",
  },
  schedule: {
    icon: CalendarClock,
    tone: "accent",
    label: "Agendado",
  },
  upgrade: {
    icon: TrendingUp,
    tone: "accent",
    label: "Upgrade",
  },
  suggestion: {
    icon: Sparkles,
    tone: "neutral",
    label: "Sugerencia",
  },
};

export const PersonalizedRecommendations = memo(function PersonalizedRecommendations({
  data,
}: PersonalizedRecommendationsProps) {
  if (!data.recommendations.length) return null;

  return (
    <section aria-labelledby="recos-heading">
      <div className="mb-4">
        <Kicker>Podes aprovechar</Kicker>
        <SectionTitle id="recos-heading" className="mt-0.5">
          Ideas para tu próxima compra
        </SectionTitle>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.recommendations.map((reco) => {
          const meta = INTENT_META[reco.intent];
          const Icon = meta.icon;
          return (
            <Link
              key={reco.id}
              href={reco.href}
              className={cn(
                "group rounded-xl border p-5 flex flex-col gap-3 transition-colors",
                meta.tone === "warning"
                  ? "border-[color-mix(in_oklch,var(--data-warning)_40%,transparent)] bg-[color-mix(in_oklch,var(--data-warning)_6%,var(--surface-raised))]"
                  : meta.tone === "accent"
                    ? "border-[color-mix(in_oklch,var(--accent)_30%,transparent)] bg-[color-mix(in_oklch,var(--accent)_6%,var(--surface-raised))]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]",
              )}
            >
              <div className="flex items-center gap-2">
                <IconBadge
                  size="sm"
                  shape="square"
                  intent={
                    meta.tone === "warning"
                      ? "warning"
                      : meta.tone === "accent"
                        ? "primary"
                        : "muted"
                  }
                >
                  <Icon className="h-3 w-3" aria-hidden />
                </IconBadge>
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {meta.label}
                </span>
              </div>
              <div className="flex-1">
                <CardTitle className="leading-snug">{reco.title}</CardTitle>
                <BodyText className="mt-1 text-[var(--text-secondary)] text-[length:var(--ts-xs)] leading-relaxed">
                  {reco.description}
                </BodyText>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)]">
                {reco.ctaLabel}
                <ArrowRight
                  className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform"
                  aria-hidden
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
});

export default PersonalizedRecommendations;
