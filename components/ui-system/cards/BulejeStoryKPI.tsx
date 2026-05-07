"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { ArrowRight, Sparkles, AlertTriangle, Target, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@buleje/design-system";
import { BulejeSparkline } from "../charts/BulejeSparkline";
import { generateKPIStory, type KPIContext } from "@/lib/narrative/kpi-story";

/**
 * BulejeStoryKPI — KPI hero que cuenta HISTORIA, no solo muestra número.
 *
 * Reemplaza BulejeMetricHeroCard cuando queres narrativa emocional.
 * Cada mount genera auto narrativa contextualizada:
 *   - Headline emocional ("Tu mejor martes del año")
 *   - Causa probable ("Ticket promedio subió por Inca Kola")
 *   - Next action contextual ("Anotá qué hiciste diferente")
 *
 * Research: "Numbers need stories" — Executive Dashboard Design 2026
 *
 * @example
 * <BulejeStoryKPI
 *   kicker="Ventas de hoy"
 *   value={4520}
 *   previousValue={4030}
 *   avgValue={3800}
 *   bestValue={4500}
 *   unit="ventas"
 *   prefix="S/ "
 *   decimals={2}
 *   sparkline={[...]}
 *   nextActionHref="/admin?module=promociones"
 * />
 */

interface Props {
  kicker: string;
  value: number;
  previousValue?: number;
  avgValue?: number;
  bestValue?: number;
  unit: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  sparkline?: number[];
  nextActionHref?: string;
  ownerName?: string;
  className?: string;
}

const TONE_STYLES = {
  celebrate: {
    bg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800/40",
    accent: "text-[var(--data-success-700)] dark:text-emerald-400",
    icon: Sparkles,
  },
  motivate: {
    bg: "bg-[var(--surface-sunken)]",
    border: "border-[var(--rule-base)]",
    accent: "text-[var(--amazon-river,#4A6A7A)]",
    icon: Target,
  },
  alert: {
    bg: "bg-amber-50/60 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800/40",
    accent: "text-amber-800 dark:text-amber-400",
    icon: AlertTriangle,
  },
  neutral: {
    bg: "bg-[var(--surface-raised)]",
    border: "border-[var(--rule-base)]",
    accent: "text-[var(--text-secondary)]",
    icon: TrendingUp,
  },
} as const;

export const BulejeStoryKPI = memo(function BulejeStoryKPI({
  kicker,
  value,
  previousValue,
  avgValue,
  bestValue,
  unit,
  prefix,
  suffix,
  decimals = 0,
  sparkline,
  nextActionHref,
  ownerName,
  className,
}: Props) {
  const ctx: KPIContext = {
    value,
    previousValue,
    avgValue,
    bestValue,
    unit,
    prefix,
    ownerName,
  };
  const story = generateKPIStory(ctx);
  const toneStyle = TONE_STYLES[story.tone];
  const Icon = toneStyle.icon;

  const delta =
    previousValue != null && previousValue > 0
      ? ((value - previousValue) / previousValue) * 100
      : null;
  const dir: "up" | "down" | "flat" =
    delta == null ? "flat" : delta > 1 ? "up" : delta < -1 ? "down" : "flat";

  return (
    <section
      className={cn(
        "rounded-xl border-2 overflow-hidden",
        toneStyle.border,
        className,
      )}
      aria-labelledby={`story-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
    >
      {/* Top zone con value */}
      <div className="p-6 bg-[var(--surface-raised)]">
        <p
          id={`story-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2"
        >
          {kicker}
        </p>
        <div className="flex items-baseline gap-1 mb-2">
          {prefix && (
            <span className="text-xl sm:text-2xl font-bold text-[var(--text-tertiary)]">
              {prefix}
            </span>
          )}
          <NumberFlow
            value={value}
            format={{ maximumFractionDigits: decimals, minimumFractionDigits: decimals }}
            className="text-4xl sm:text-5xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none"
          />
          {suffix && (
            <span className="text-lg font-semibold text-[var(--text-tertiary)]">
              {suffix}
            </span>
          )}
        </div>

        {/* Delta simple */}
        {delta != null && (
          <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
            <span
              className={cn(
                "font-bold",
                dir === "up" && "text-[var(--data-success-500)]",
                dir === "down" && "text-[var(--data-error-500)]",
              )}
            >
              {dir === "up" && "↑"}
              {dir === "down" && "↓"}
              {Math.abs(delta).toFixed(1)}%
            </span>
            {" vs ayer"}
          </p>
        )}

        {/* Sparkline */}
        {sparkline && sparkline.length > 1 && (
          <div className="mt-4">
            <BulejeSparkline
              data={sparkline}
              trend={dir === "flat" ? "neutral" : dir}
              width="100%"
              height={32}
              strokeWidth={1.75}
            />
          </div>
        )}
      </div>

      {/* Story zone */}
      <div className={cn("px-6 py-5", toneStyle.bg)}>
        <div className="flex items-start gap-3">
          <span className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)]",
            toneStyle.accent,
          )}>
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            {/* Headline emocional */}
            <p className={cn(
              "text-base font-extrabold tracking-tight leading-snug",
              toneStyle.accent,
            )}>
              {story.headline}
            </p>
            {/* Causa probable */}
            {story.cause && (
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                {story.cause}
              </p>
            )}
            {/* Next action CTA */}
            {story.nextAction && (
              <div className="mt-3 flex items-center gap-2">
                {nextActionHref ? (
                  <PrimaryButton
                    asChild
                    size="sm"
                    className="rounded-full"
                    rightIcon={<ArrowRight className="h-3 w-3" strokeWidth={2} />}
                  >
                    <a href={nextActionHref}>{story.nextAction}</a>
                  </PrimaryButton>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)] italic">
                    💡 {story.nextAction}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});
