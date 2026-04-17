"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { CHART_PALETTE } from "./palette";

/**
 * BulejeRadialProgress — progreso semicircular con actual + meta + proyección.
 *
 * Mejor que gauge simple: muestra 3 capas superpuestas:
 *   - Arco exterior: meta total (100%)
 *   - Arco principal: actual (color primary)
 *   - Arco punteado: proyección fin de periodo (color accent)
 *
 * @example
 * <BulejeRadialProgress
 *   actual={6700}
 *   target={10000}
 *   projected={8900}
 *   label="Meta del mes"
 *   sublabel="Abril 2026"
 *   format={(v) => `S/ ${v.toLocaleString('es-PE')}`}
 * />
 */

interface Props {
  actual: number;
  target: number;
  /** Valor proyectado al cierre del periodo */
  projected?: number;
  label?: string;
  sublabel?: string;
  format?: (value: number) => string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const BulejeRadialProgress = memo(function BulejeRadialProgress({
  actual,
  target,
  projected,
  label,
  sublabel,
  format,
  size = 260,
  strokeWidth = 14,
  className,
}: Props) {
  const actualPct = Math.min(100, (actual / target) * 100);
  const projectedPct = projected != null ? Math.min(100, (projected / target) * 100) : null;

  // Arc geometry
  const r = (size / 2) - strokeWidth - 4;
  const cx = size / 2;
  const cy = size / 2;
  const sweepDegrees = 180;

  // Convertir degrees a coord
  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 180) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const describeArc = (endPct: number) => {
    const endAngle = (endPct / 100) * sweepDegrees;
    const start = polarToCartesian(0);
    const end = polarToCartesian(endAngle);
    const largeArc = endAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const bgPath = describeArc(100);
  const actualPath = describeArc(actualPct);
  const projectedPath = projectedPct != null ? describeArc(projectedPct) : null;

  const formatted = format
    ? format(actual).replace(/[^\d.,\s-]/g, "") // extract number part for NumberFlow
    : actual.toLocaleString("es-PE");

  // Delta hasta meta
  const delta = target - actual;
  const deltaPct = ((delta / target) * 100).toFixed(0);

  // Forecast status
  const onTrack = projectedPct != null ? projectedPct >= 90 : null;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {label && (
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
          {label}
        </p>
      )}
      {sublabel && (
        <p className="text-xs text-[var(--text-tertiary)] mb-3">{sublabel}</p>
      )}

      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg
          width={size}
          height={size / 2 + 20}
          viewBox={`0 0 ${size} ${size / 2 + 20}`}
          aria-hidden
        >
          {/* Background arc */}
          <path
            d={bgPath}
            fill="none"
            stroke="var(--rule-base, #e5e5e5)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Projected arc (punteado) */}
          {projectedPath && (
            <path
              d={projectedPath}
              fill="none"
              stroke={CHART_PALETTE.accent}
              strokeWidth={strokeWidth / 2}
              strokeLinecap="round"
              strokeDasharray="3 5"
              opacity={0.5}
            />
          )}
          {/* Actual arc */}
          <path
            d={actualPath}
            fill="none"
            stroke={CHART_PALETTE.primary}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </svg>

        {/* Center value */}
        <div
          className="absolute left-0 right-0 flex flex-col items-center"
          style={{ bottom: 0, top: size / 3 }}
        >
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] tabular-nums">
            Actual
          </p>
          <div className="flex items-baseline gap-0.5 text-[var(--text-primary)] mt-1">
            {format && <span className="text-base font-bold">{format(0).replace(/[\d.,\s-]/g, "").trim()}</span>}
            <NumberFlow
              value={actual}
              className="text-3xl sm:text-4xl font-extrabold tabular-nums tracking-[var(--ls-tight)] leading-none"
            />
          </div>
          <p className="mt-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums">
            {actualPct.toFixed(0)}% de {format ? format(target) : target.toLocaleString("es-PE")}
          </p>
        </div>
      </div>

      {/* Stats debajo */}
      <div className="grid grid-cols-3 gap-0 mt-2 w-full max-w-sm border-t border-[var(--rule-soft)] pt-3">
        <div className="text-center">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Faltante
          </p>
          <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)] mt-1">
            {format ? format(Math.max(0, delta)) : Math.max(0, delta).toLocaleString("es-PE")}
          </p>
          <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] tabular-nums">
            {deltaPct}% por ir
          </p>
        </div>
        {projected != null && (
          <div className="text-center border-x border-[var(--rule-soft)] px-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Proyectado
            </p>
            <p
              className={cn(
                "text-sm font-extrabold tabular-nums mt-1",
                onTrack ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
              )}
            >
              {format ? format(projected) : projected.toLocaleString("es-PE")}
            </p>
            <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
              {onTrack ? "En ruta" : "Ajustar"}
            </p>
          </div>
        )}
        <div className="text-center">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Meta
          </p>
          <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)] mt-1">
            {format ? format(target) : target.toLocaleString("es-PE")}
          </p>
          <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
            100%
          </p>
        </div>
      </div>
    </div>
  );
});
