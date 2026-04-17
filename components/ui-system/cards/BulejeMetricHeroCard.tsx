"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BulejeSparkline } from "../charts/BulejeSparkline";

/**
 * BulejeMetricHeroCard — KPI hero card con 3+ señales en 1.
 *
 * Anatomía (research 2026 - Mercury/Ramp/Stripe):
 *   • Kicker
 *   • Hero value (NumberFlow animado)
 *   • 3 sub-metrics (mini stats bar)
 *   • Sparkline 30d
 *   • Delta matrix (vs ayer / vs semana / vs mes)
 *
 * Reemplaza 4+ KPI cards simples con 1 card denso.
 *
 * @example
 * <BulejeMetricHeroCard
 *   kicker="Ventas"
 *   heroValue={18420}
 *   prefix="S/ "
 *   decimals={2}
 *   subMetrics={[
 *     { label: "Pedidos", value: 64 },
 *     { label: "Ticket prom.", value: 47.8, prefix: "S/ ", decimals: 2 },
 *     { label: "Clientes", value: 42 },
 *   ]}
 *   sparkline={[120, 140, 180, 165, 210, 245, 287]}
 *   deltas={[
 *     { label: "vs ayer", value: 12.5 },
 *     { label: "vs semana", value: 8.2 },
 *     { label: "vs mes", value: -2.1 },
 *   ]}
 * />
 */

interface SubMetric {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

interface DeltaEntry {
  label: string;
  value: number;
}

interface Props {
  kicker: string;
  heroValue: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  subMetrics?: SubMetric[];
  sparkline?: number[];
  deltas?: DeltaEntry[];
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

export const BulejeMetricHeroCard = memo(function BulejeMetricHeroCard({
  kicker,
  heroValue,
  prefix,
  suffix,
  decimals = 0,
  subMetrics = [],
  sparkline,
  deltas = [],
  loading = false,
  className,
  onClick,
}: Props) {
  const primaryDelta = deltas[0];
  const primaryDir: "up" | "down" | "flat" =
    primaryDelta?.value == null
      ? "flat"
      : primaryDelta.value > 0
        ? "up"
        : primaryDelta.value < 0
          ? "down"
          : "flat";

  const cardClasses = cn(
    "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 transition-all",
    onClick && "cursor-pointer hover:border-[var(--rule-strong)]",
    className,
  );

  if (loading) {
    return (
      <div className={cardClasses}>
        <div className="skeleton-v4 h-3 w-20 mb-3" />
        <div className="skeleton-v4 h-10 w-40 mb-5" />
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-v4 h-12" />
          ))}
        </div>
        <div className="skeleton-v4 h-8 w-full mb-3" />
      </div>
    );
  }

  return (
    <section className={cardClasses} onClick={onClick} aria-labelledby={`hero-${kicker.replace(/\s+/g, "-").toLowerCase()}`}>
      {/* Kicker */}
      <p
        id={`hero-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
        className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2"
      >
        {kicker}
      </p>

      {/* Hero value */}
      <div className="flex items-baseline gap-1 mb-1">
        {prefix && (
          <span className="text-xl sm:text-2xl font-bold text-[var(--text-tertiary)]">
            {prefix}
          </span>
        )}
        <NumberFlow
          value={heroValue}
          format={{ maximumFractionDigits: decimals, minimumFractionDigits: decimals }}
          className="text-4xl sm:text-5xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none"
        />
        {suffix && (
          <span className="text-lg sm:text-xl font-semibold text-[var(--text-tertiary)]">
            {suffix}
          </span>
        )}
      </div>

      {/* Primary delta (big) */}
      {primaryDelta && (
        <div className="flex items-center gap-2 mt-3">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-sm font-bold tabular-nums",
              primaryDir === "up" && "text-[var(--data-success)]",
              primaryDir === "down" && "text-[var(--data-error)]",
              primaryDir === "flat" && "text-[var(--text-tertiary)]",
            )}
          >
            {primaryDir === "up" && <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {primaryDir === "down" && <ArrowDownRight className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {primaryDir === "flat" && <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {Math.abs(primaryDelta.value).toFixed(1)}%
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{primaryDelta.label}</span>
        </div>
      )}

      {/* Sub-metrics row */}
      {subMetrics.length > 0 && (
        <div className="grid grid-cols-3 gap-0 mt-6 pt-5 border-t border-[var(--rule-soft)]">
          {subMetrics.slice(0, 3).map((m, i) => (
            <div
              key={m.label}
              className={cn(
                "text-center px-2",
                i > 0 && "border-l border-[var(--rule-soft)]",
              )}
            >
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {m.label}
              </p>
              <div className="flex items-baseline justify-center gap-0.5 mt-1">
                {m.prefix && <span className="text-xs font-semibold text-[var(--text-tertiary)]">{m.prefix}</span>}
                <NumberFlow
                  value={m.value}
                  format={{ maximumFractionDigits: m.decimals ?? 0 }}
                  className="text-lg font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]"
                />
                {m.suffix && <span className="text-xs font-semibold text-[var(--text-tertiary)]">{m.suffix}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="mt-5">
          <BulejeSparkline
            data={sparkline}
            trend={primaryDir === "flat" ? "neutral" : primaryDir}
            width="100%"
            height={40}
            strokeWidth={1.75}
          />
        </div>
      )}

      {/* Secondary deltas (vs semana, vs mes) */}
      {deltas.length > 1 && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--rule-soft)]">
          {deltas.slice(1).map((d) => {
            const dir = d.value > 0 ? "up" : d.value < 0 ? "down" : "flat";
            return (
              <span
                key={d.label}
                className={cn(
                  "inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold tabular-nums",
                  dir === "up" && "text-[var(--data-success)]",
                  dir === "down" && "text-[var(--data-error)]",
                  dir === "flat" && "text-[var(--text-tertiary)]",
                )}
              >
                {dir === "up" && "↑"}
                {dir === "down" && "↓"}
                {dir === "flat" && "·"}
                {Math.abs(d.value).toFixed(1)}%
                <span className="ml-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-normal">
                  {d.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
});
