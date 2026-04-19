"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { ArrowUpRight, ArrowDownRight, Minus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BulejeSparkline } from "./BulejeSparkline";

/**
 * BulejeSparklineKPICard — tarjeta KPI editorial con:
 *   • Kicker label
 *   • Numero grande animado (NumberFlow)
 *   • Delta con flecha y % vs comparativa
 *   • Sparkline 30-day o 7-day trend
 *
 * Patron estandar para admin home, finanzas, rendimiento.
 *
 * @example
 * <BulejeSparklineKPICard
 *   label="Ventas hoy"
 *   value={4520}
 *   prefix="S/ "
 *   delta={12.5}
 *   deltaLabel="vs ayer"
 *   trend={[100, 120, 98, 140, 160, 155, 180]}
 * />
 */
interface BulejeSparklineKPICardProps {
  /** Kicker label (uppercase kicker arriba) */
  label: string;
  /** Valor principal animado */
  value: number;
  /** Prefijo — ej "S/ " */
  prefix?: string;
  /** Sufijo — ej " ordenes", "%" */
  suffix?: string;
  /** Decimales — default 0 */
  decimals?: number;
  /** Delta porcentual vs comparativa (positivo/negativo) */
  delta?: number;
  /** Label del delta — ej "vs ayer", "vs mes pasado" */
  deltaLabel?: string;
  /** Serie para sparkline (ultimos 7-30 valores) */
  trend?: number[];
  /** Layout — default vertical */
  variant?: "vertical" | "horizontal";
  /** Loading state */
  loading?: boolean;
  /** className wrapper */
  className?: string;
  /** onClick — hace card interactive */
  onClick?: () => void;
}

export const BulejeSparklineKPICard = memo(function BulejeSparklineKPICard({
  label,
  value,
  prefix,
  suffix,
  decimals = 0,
  delta,
  deltaLabel,
  trend,
  variant = "vertical",
  loading = false,
  className,
  onClick,
}: BulejeSparklineKPICardProps) {
  const deltaDirection = delta == null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const deltaArrowIcon = (() => {
    if (deltaDirection === "up") return ArrowUpRight;
    if (deltaDirection === "down") return ArrowDownRight;
    return Minus;
  })();
  const DeltaArrow = deltaArrowIcon;

  const deltaColor =
    deltaDirection === "up"
      ? "text-[var(--data-success,#047857)]"
      : deltaDirection === "down"
        ? "text-[var(--data-error,#b91c1c)]"
        : "text-[var(--text-tertiary,#a3a3a3)]";

  const cardClasses = cn(
    "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 transition-all",
    onClick && "cursor-pointer hover:border-[var(--rule-strong)] elev-hover active:translate-y-px",
    className,
  );

  if (loading) {
    return (
      <div className={cardClasses}>
        <div className="skeleton-v4 h-3 w-20 mb-4" />
        <div className="skeleton-v4 h-10 w-32 mb-3" />
        <div className="skeleton-v4 h-4 w-24" />
      </div>
    );
  }

  if (variant === "horizontal") {
    return (
      <div className={cardClasses} onClick={onClick}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {label}
            </p>
            <div className="mt-2 flex items-baseline gap-1">
              {prefix && <span className="text-lg font-bold text-[var(--text-tertiary)]">{prefix}</span>}
              <NumberFlow
                value={value}
                format={{ maximumFractionDigits: decimals }}
                className="text-3xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]"
              />
              {suffix && <span className="text-base font-semibold text-[var(--text-tertiary)]">{suffix}</span>}
            </div>
            {delta != null && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold tabular-nums", deltaColor)}>
                  <DeltaArrow className="h-3 w-3" strokeWidth={2} />
                  {Math.abs(delta).toFixed(1)}%
                </span>
                {deltaLabel && (
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{deltaLabel}</span>
                )}
              </div>
            )}
          </div>
          {trend && trend.length > 1 && (
            <div className="shrink-0">
              <BulejeSparkline
                data={trend}
                trend={deltaDirection === "flat" ? "neutral" : deltaDirection}
                width={96}
                height={40}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cardClasses} onClick={onClick}>
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </p>
      <div className="mt-3 flex items-baseline gap-1">
        {prefix && <span className="text-xl font-bold text-[var(--text-tertiary)]">{prefix}</span>}
        <NumberFlow
          value={value}
          format={{ maximumFractionDigits: decimals }}
          className="text-4xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none"
        />
        {suffix && <span className="text-lg font-semibold text-[var(--text-tertiary)]">{suffix}</span>}
      </div>
      {(delta != null || (trend && trend.length > 1)) && (
        <div className="mt-4 flex items-center justify-between">
          {delta != null ? (
            <div className="flex items-center gap-1.5">
              <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold tabular-nums", deltaColor)}>
                <DeltaArrow className="h-3 w-3" strokeWidth={2} />
                {Math.abs(delta).toFixed(1)}%
              </span>
              {deltaLabel && (
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{deltaLabel}</span>
              )}
            </div>
          ) : (
            <span />
          )}
          {trend && trend.length > 1 && (
            <BulejeSparkline
              data={trend}
              trend={deltaDirection === "flat" ? "neutral" : deltaDirection}
              width={80}
              height={28}
            />
          )}
        </div>
      )}
    </div>
  );
});
