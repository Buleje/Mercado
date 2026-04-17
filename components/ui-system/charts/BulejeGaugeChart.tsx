"use client";

import NumberFlow from "@number-flow/react";
import { CHART_PALETTE } from "./palette";
import { cn } from "@/lib/utils";

/**
 * BulejeGaugeChart — medidor semicircular editorial.
 *
 * Uso tipico: "Meta del mes 67%", "Ocupacion actual", "Score NPS".
 *
 * Render con puros SVG arcs — sin libreria externa.
 * Size responsive: fill parent width, altura auto.
 *
 * @example
 * <BulejeGaugeChart
 *   value={67}
 *   label="Meta del mes"
 *   sublabel="S/ 6,700 / S/ 10,000"
 *   format="percentage"
 * />
 */
interface BulejeGaugeChartProps {
  /** Valor actual 0-100 (porcentaje). */
  value: number;
  /** Minimo rango — default 0. */
  min?: number;
  /** Maximo rango — default 100. */
  max?: number;
  /** Label superior (kicker) */
  label?: string;
  /** Label debajo del numero grande */
  sublabel?: string;
  /** Formato del numero grande */
  format?: "percentage" | "number" | "currency";
  /** Color del arc activo — default accent. */
  color?: string;
  /** Size en px — default 240. */
  size?: number;
  /** Tick marks cada N% — default 25 (0/25/50/75/100) */
  tickEvery?: number;
  /** className wrapper */
  className?: string;
}

export function BulejeGaugeChart({
  value,
  min = 0,
  max = 100,
  label,
  sublabel,
  format = "percentage",
  color = CHART_PALETTE.primary,
  size = 240,
  tickEvery = 25,
  className,
}: BulejeGaugeChartProps) {
  const clamped = Math.max(min, Math.min(max, value));
  const normalized = (clamped - min) / (max - min);
  const sweepDegrees = 180;
  const activeSweep = normalized * sweepDegrees;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 20;
  const strokeWidth = 12;

  // Arc path (semi-circulo desde 180° hasta 0° en sentido horario)
  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 180) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const startBg = polarToCartesian(0);
  const endBg = polarToCartesian(180);
  const pathBg = `M ${startBg.x} ${startBg.y} A ${r} ${r} 0 0 1 ${endBg.x} ${endBg.y}`;

  const endActive = polarToCartesian(activeSweep);
  const largeArc = activeSweep > 180 ? 1 : 0;
  const pathActive = `M ${startBg.x} ${startBg.y} A ${r} ${r} 0 ${largeArc} 1 ${endActive.x} ${endActive.y}`;

  // Tick marks
  const ticks: number[] = [];
  for (let t = min; t <= max; t += tickEvery) {
    ticks.push(t);
  }

  const displayValue = (() => {
    if (format === "percentage") return normalized * 100;
    return value;
  })();

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size / 2 + 12 }}>
        <svg
          width={size}
          height={size / 2 + 12}
          viewBox={`0 0 ${size} ${size / 2 + 12}`}
          aria-hidden
        >
          {/* Background arc */}
          <path
            d={pathBg}
            fill="none"
            stroke="var(--rule-base, #e5e5e5)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Active arc */}
          <path
            d={pathActive}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
          {/* Tick marks */}
          {ticks.map((t) => {
            const tNormalized = (t - min) / (max - min);
            const tAngle = tNormalized * sweepDegrees;
            const outer = polarToCartesian(tAngle);
            const innerR = r - strokeWidth - 4;
            const rad = ((tAngle - 180) * Math.PI) / 180;
            const inner = {
              x: cx + innerR * Math.cos(rad),
              y: cy + innerR * Math.sin(rad),
            };
            return (
              <line
                key={t}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                stroke="var(--text-tertiary, #a3a3a3)"
                strokeWidth={1}
                opacity={0.5}
              />
            );
          })}
        </svg>
        {/* Big number center */}
        <div
          className="absolute left-0 right-0 flex flex-col items-center justify-end text-center"
          style={{ bottom: 0, top: size / 3.5 }}
        >
          <div className="flex items-baseline gap-0.5 text-[var(--text-primary)]">
            <NumberFlow
              value={displayValue}
              format={{
                maximumFractionDigits: format === "percentage" ? 0 : 2,
              }}
              className="text-5xl font-extrabold tabular-nums tracking-[-0.03em] leading-none"
            />
            {format === "percentage" && (
              <span className="text-xl font-bold text-[var(--text-tertiary)]">%</span>
            )}
          </div>
          {sublabel && (
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {sublabel}
            </p>
          )}
        </div>
      </div>
      {label && (
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)]">
          {label}
        </p>
      )}
    </div>
  );
}
