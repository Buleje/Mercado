"use client";

/**
 * @buleje/design-system/dashboard — KpiCard
 *
 * Tarjeta de KPI con valor principal, delta y sparkline SVG opcional.
 * Cero hex — solo tokens CSS.
 *
 * @example
 * <KpiCard label="Ventas" value="S/ 4,520" delta={12.5} sparkline={[10,20,15,30]} />
 */

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "../icons";
import { cn } from "../utils";

export type KpiCardVariant = "default" | "minimal";
export type KpiCardTone = "neutral" | "success" | "warning" | "danger";

export interface KpiCardProps {
  label: string;
  value: string;
  /** Delta porcentual. Positivo = verde (salvo invertTrend). */
  delta?: number | null;
  /** Label del delta (ej: "vs ayer"). */
  deltaLabel?: string;
  /** Invertir lógica de color: delta negativo es bueno (ej: "cancelaciones"). */
  invertTrend?: boolean;
  /** Serie numérica para sparkline inline. Mín 2 puntos. */
  sparkline?: number[];
  /** Intent semántico del valor. Default neutral. */
  tone?: KpiCardTone;
  /** Ícono junto al label. */
  icon?: LucideIcon;
  /**
   * - default — p-4 con sombra suave
   * - minimal — sin borde, fondo sunken
   */
  variant?: KpiCardVariant;
  className?: string;
}

// ── Tone → colores de texto ────────────────────────────────────────────────
const TONE_VALUE: Record<KpiCardTone, string> = {
  neutral: "text-[var(--text-primary)]",
  success: "text-[var(--data-success)]",
  warning: "text-[var(--data-warning)]",
  danger:  "text-[var(--data-error)]",
};

// ── Mini sparkline SVG (sin dependencias externas) ─────────────────────────
function MiniSparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 64;
  const H = 20;
  const step = W / (data.length - 1);
  const pts = data
    .map((v, i) => {
      const x = i * step;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke = positive
    ? "var(--data-success)"
    : "var(--data-error)";

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="opacity-75"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Count-up animation ─────────────────────────────────────────────────────
function useCountUp(target: string, duration = 500) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    if (prevRef.current === target) { setDisplay(target); return; }
    prevRef.current = target;
    const numMatch = target.match(/([\d,.]+)/);
    if (!numMatch) { setDisplay(target); return; }
    const endVal = parseFloat(numMatch[1].replace(/,/g, ""));
    if (isNaN(endVal)) { setDisplay(target); return; }
    const prefix = target.slice(0, numMatch.index!);
    const suffix = target.slice(numMatch.index! + numMatch[1].length);
    const hasDecimal = numMatch[1].includes(".");
    const start = performance.now();
    let rafId: number;
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * endVal;
      setDisplay(
        `${prefix}${hasDecimal ? current.toFixed(2) : Math.round(current).toLocaleString("es-PE")}${suffix}`,
      );
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return display;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  invertTrend = false,
  sparkline,
  tone = "neutral",
  icon: Icon,
  variant = "default",
  className,
}: KpiCardProps) {
  const animated = useCountUp(value);

  const deltaPositive =
    delta != null ? (invertTrend ? delta <= 0 : delta >= 0) : true;

  return (
    <div
      className={cn(
        "rounded-xl",
        variant === "default"
          ? "bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4"
          : "bg-[var(--surface-sunken)] p-3",
        className,
      )}
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && (
          <Icon
            className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0"
            aria-hidden="true"
          />
        )}
        <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-secondary)] uppercase tracking-wide leading-none">
          {label}
        </p>
      </div>

      {/* Value */}
      <p
        className={cn(
          "text-xl font-extrabold tabular-nums leading-tight",
          TONE_VALUE[tone],
        )}
        aria-label={`${label}: ${value}`}
      >
        {animated}
      </p>

      {/* Delta + sparkline row */}
      <div className="flex items-end justify-between mt-1.5 gap-2">
        {delta != null ? (
          <span
            className={cn(
              "text-[length:var(--ts-2xs)] font-bold",
              deltaPositive
                ? "text-[var(--data-success)]"
                : "text-[var(--data-error)]",
            )}
          >
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
            {deltaLabel && (
              <span className="font-normal text-[var(--text-tertiary)] ml-1">
                {deltaLabel}
              </span>
            )}
          </span>
        ) : (
          <span />
        )}

        {sparkline && sparkline.length >= 2 && (
          <MiniSparkline data={sparkline} positive={deltaPositive} />
        )}
      </div>
    </div>
  );
}
