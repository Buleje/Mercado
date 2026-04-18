"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { TrendingUp, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { BulejeSparkline } from "../charts/BulejeSparkline";

/**
 * BulejeForecastCard — proyección actual + meta + % cumplimiento + ETA.
 *
 * Patron: muestra SI voy a llegar a la meta. Cuatro señales en 1 card:
 *   1. Actual (con sparkline running)
 *   2. Proyectado (extrapolación lineal)
 *   3. Meta (target)
 *   4. ETA — días a meta si mantengo ritmo
 *
 * @example
 * <BulejeForecastCard
 *   kicker="Meta del mes"
 *   sublabel="Abril · día 17 de 30"
 *   actual={6700}
 *   projected={11800}
 *   target={10000}
 *   prefix="S/ "
 *   sparkline={last17DaysTrend}
 * />
 */

interface Props {
  kicker: string;
  sublabel?: string;
  actual: number;
  projected: number;
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  sparkline?: number[];
  /** Texto ETA personalizado. Si omitido, calcula automatico. */
  eta?: string;
  loading?: boolean;
  className?: string;
}

export const BulejeForecastCard = memo(function BulejeForecastCard({
  kicker,
  sublabel,
  actual,
  projected,
  target,
  prefix,
  suffix,
  decimals = 0,
  sparkline,
  eta,
  loading = false,
  className,
}: Props) {
  const actualPct = Math.min(100, (actual / target) * 100);
  const projectedPct = Math.min(100, (projected / target) * 100);
  const onTrack = projected >= target;
  const overTarget = projected > target * 1.1;

  if (loading) {
    return (
      <div className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5",
        className,
      )}>
        <div className="skeleton-v4 h-3 w-24 mb-3" />
        <div className="skeleton-v4 h-8 w-32 mb-4" />
        <div className="skeleton-v4 h-3 w-full mb-3" />
        <div className="skeleton-v4 h-12 w-full" />
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 overflow-hidden",
        className,
      )}
      aria-labelledby={`forecast-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
    >
      {/* Header */}
      <header className="mb-4">
        <p
          id={`forecast-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
        >
          {kicker}
        </p>
        {sublabel && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sublabel}</p>
        )}
      </header>

      {/* Actual value */}
      <div className="flex items-baseline gap-1 mb-3">
        {prefix && (
          <span className="text-lg font-bold text-[var(--text-tertiary)]">{prefix}</span>
        )}
        <NumberFlow
          value={actual}
          format={{ maximumFractionDigits: decimals }}
          className="text-3xl sm:text-4xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none"
        />
        {suffix && (
          <span className="text-base font-semibold text-[var(--text-tertiary)]">{suffix}</span>
        )}
      </div>

      {/* Progress bar con dual-layer: actual sólido + projected punteado */}
      <div className="relative h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden mb-1">
        {/* Projected (background lighter) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${projectedPct}%`,
            background: "var(--accent)",
            opacity: 0.25,
            transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {/* Actual (solid on top) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${actualPct}%`,
            background: "var(--text-primary)",
            transition: "width 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] tabular-nums mb-4">
        {actualPct.toFixed(0)}% cumplido · {projectedPct.toFixed(0)}% proyectado
      </p>

      {/* Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="mb-4">
          <BulejeSparkline
            data={sparkline}
            trend={onTrack ? "up" : "down"}
            width="100%"
            height={40}
            strokeWidth={2}
          />
        </div>
      )}

      {/* Meta + Proyectado breakdown */}
      <div className="grid grid-cols-2 gap-0 pt-3 border-t border-[var(--rule-soft)]">
        <div className="pr-3">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1">
            <TrendingUp className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            Proyectado
          </p>
          <p
            className={cn(
              "text-base font-extrabold tabular-nums tracking-[var(--ls-tight)] mt-1",
              onTrack ? "text-[var(--data-success)]" : "text-[var(--data-warning)]",
            )}
          >
            {prefix}
            {projected.toLocaleString("es-PE", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
            {suffix}
          </p>
        </div>
        <div className="pl-3 border-l border-[var(--rule-soft)]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1">
            <Target className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            Meta
          </p>
          <p className="text-base font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] mt-1">
            {prefix}
            {target.toLocaleString("es-PE", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
            {suffix}
          </p>
        </div>
      </div>

      {/* ETA status */}
      {(eta || onTrack != null) && (
        <div
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-xs",
            onTrack && !overTarget && "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400",
            overTarget && "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400",
            !onTrack && "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400",
          )}
        >
          {eta ??
            (overTarget
              ? `Vas a superar la meta en ${((projected / target - 1) * 100).toFixed(0)}%`
              : onTrack
                ? "En ruta para llegar a la meta"
                : `Te faltan ${prefix ?? ""}${(target - projected).toLocaleString("es-PE")}${suffix ?? ""} — acelerá el ritmo`)}
        </div>
      )}
    </section>
  );
});
