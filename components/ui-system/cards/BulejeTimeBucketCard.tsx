"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";

/**
 * BulejeTimeBucketCard — mañana / tarde / noche breakdown en 1 card.
 *
 * Muestra cómo se distribuye una métrica en 3 franjas horarias.
 * Bars proporcionales + valor + % del total.
 *
 * @example
 * <BulejeTimeBucketCard
 *   kicker="Ventas por franja"
 *   sublabel="Últimos 7 días"
 *   buckets={[
 *     { label: "Mañana", sublabel: "6:00-12:00", value: 4200, color: "data-1" },
 *     { label: "Tarde", sublabel: "12:00-19:00", value: 8950, color: "data-5" },
 *     { label: "Noche", sublabel: "19:00-22:00", value: 2180, color: "data-3" },
 *   ]}
 *   prefix="S/ "
 * />
 */

type ColorKey = "primary" | "secondary" | "tertiary" | "quaternary" | "accent" | "info" | "amber" | "purple" | "data-1" | "data-5" | "data-3";

interface Bucket {
  label: string;
  sublabel?: string;
  value: number;
  color?: ColorKey;
}

interface Props {
  kicker: string;
  sublabel?: string;
  buckets: Bucket[];
  prefix?: string;
  suffix?: string;
  decimals?: number;
  loading?: boolean;
  className?: string;
}

const COLOR_MAP: Record<string, string> = {
  primary: "var(--data-1)",
  secondary: "var(--data-2)",
  tertiary: "var(--data-3)",
  quaternary: "var(--data-4)",
  accent: "var(--data-5)",
  info: "var(--data-6)",
  amber: "var(--data-7)",
  purple: "var(--data-8)",
  "data-1": "var(--data-1)",
  "data-5": "var(--data-5)",
  "data-3": "var(--data-3)",
};

export const BulejeTimeBucketCard = memo(function BulejeTimeBucketCard({
  kicker,
  sublabel,
  buckets,
  prefix,
  suffix,
  decimals = 0,
  loading = false,
  className,
}: Props) {
  const total = buckets.reduce((s, b) => s + b.value, 0);

  if (loading) {
    return (
      <div className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5",
        className,
      )}>
        <div className="skeleton-v4 h-3 w-24 mb-4" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-4">
            <div className="flex justify-between mb-1">
              <div className="skeleton-v4 h-3 w-20" />
              <div className="skeleton-v4 h-3 w-16" />
            </div>
            <div className="skeleton-v4 h-2 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5",
        className,
      )}
      aria-labelledby={`bucket-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <header className="mb-4">
        <p
          id={`bucket-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
        >
          {kicker}
        </p>
        {sublabel && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sublabel}</p>
        )}
      </header>

      <div className="space-y-4">
        {buckets.map((bucket) => {
          const pct = total > 0 ? (bucket.value / total) * 100 : 0;
          const color = COLOR_MAP[bucket.color ?? "primary"] ?? COLOR_MAP.primary;
          return (
            <div key={bucket.label}>
              <div className="flex items-baseline justify-between mb-1.5 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
                    {bucket.label}
                    {bucket.sublabel && (
                      <span className="ml-2 text-[length:var(--ts-2xs)] font-normal uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                        {bucket.sublabel}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                    {prefix}
                    <NumberFlow
                      value={bucket.value}
                      format={{ maximumFractionDigits: decimals }}
                    />
                    {suffix}
                  </span>
                  <span className="ml-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="relative h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: color,
                    transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--rule-soft)]">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Total
        </span>
        <span className="text-base font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          {prefix}
          {total.toLocaleString("es-PE", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}
          {suffix}
        </span>
      </div>
    </section>
  );
});
