"use client";

import { memo } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UnifiedKPITile — KPI tile ESTRICTO con tokens v4 (ADR-068 Ola S).
 *
 * Reemplaza todos los KPITile custom con colormap payaso
 * (emerald/blue/violet/cyan/amber/red arbitrario) que encontramos
 * en 14 dashboards del admin/inicio.
 *
 * Regla de armonía:
 * - Fondos siempre var(--surface-raised)
 * - Borders siempre var(--rule-base)
 * - Iconos siempre text-[var(--text-primary)] neutral (no colored decorativo)
 * - Deltas: solo green (success) / red (danger) / gray (neutral) — semántico
 * - Sparkline: color auto por delta direction (no arbitrario)
 *
 * Prop `intent` ÚNICA forma de colorear (y solo con significado real):
 *   - undefined → neutral (default, monocromo)
 *   - "success" → highlights green (metrica buena)
 *   - "warning" → highlights amber (atención)
 *   - "danger" → highlights red (alerta)
 *
 * @example
 * <UnifiedKPITile
 *   label="Ventas hoy"
 *   value="S/ 4,520"
 *   Icon={TrendingUp}
 *   delta={12.5}
 *   sparkline={[3200, 3800, 4200, 4520]}
 * />
 */

type Intent = "success" | "warning" | "danger" | "neutral";

interface Props {
  label: string;
  value: string | number;
  Icon?: LucideIcon;
  /** Delta % — positivo verde, negativo rojo. Si es 0 o null → neutral */
  delta?: number | null;
  /** Si true, invierte trend (ej: stock bajo es malo, delta positivo = malo) */
  invertTrend?: boolean;
  /** Sparkline data — color auto por delta */
  sparkline?: number[];
  /** Intent semántico. Default neutral (no color decorativo). */
  intent?: Intent;
  /** Label secundario (ej: "vs ayer", "última hora") */
  deltaLabel?: string;
  /** Sub-value pequeño debajo del main */
  subValue?: string;
  /** Prefix del value (ej "S/ ") — si value ya string, ignorado */
  prefix?: string;
  className?: string;
  onClick?: () => void;
}

// ── MiniSparkline interno sin arbitrary color ─────────────────────

function InlineSparkline({ data, up }: { data: number[]; up: boolean | null }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Color: solo semantic, no arbitrary
  const color =
    up === true
      ? "var(--data-success)"
      : up === false
        ? "var(--data-error)"
        : "var(--text-tertiary)";
  return (
    <svg width={w} height={h} className="block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const UnifiedKPITile = memo(function UnifiedKPITile({
  label,
  value,
  Icon,
  delta,
  invertTrend = false,
  sparkline,
  intent = "neutral",
  deltaLabel,
  subValue,
  prefix,
  className,
  onClick,
}: Props) {
  const hasDelta = delta != null;
  const isPositiveDelta = hasDelta ? (invertTrend ? delta <= 0 : delta >= 0) : false;
  const isNeutralDelta = delta === 0;

  // Delta color strictly semantic
  const deltaTextColor = !hasDelta
    ? "text-[var(--text-tertiary)]"
    : isNeutralDelta
      ? "text-[var(--text-tertiary)]"
      : isPositiveDelta
        ? "text-[var(--data-success)]"
        : "text-[var(--data-error)]";

  const deltaBgColor = !hasDelta
    ? ""
    : isNeutralDelta
      ? "bg-[var(--surface-sunken)]"
      : isPositiveDelta
        ? "bg-emerald-50 dark:bg-emerald-950/30"
        : "bg-red-50 dark:bg-red-950/30";

  // Intent top-bar (accent thin stripe if intent !== neutral)
  const intentBar = {
    success: "bg-[var(--data-success)]",
    warning: "bg-[var(--data-warning)]",
    danger: "bg-[var(--data-error)]",
    neutral: "",
  }[intent];

  const sparklineUp = !hasDelta
    ? null
    : isNeutralDelta
      ? null
      : isPositiveDelta;

  return (
    <div
      className={cn(
        "relative rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 overflow-hidden transition-all",
        onClick && "cursor-pointer hover:border-[var(--rule-strong)]",
        "elev-hover",
        className,
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Intent top stripe (only if meaningful) */}
      {intent !== "neutral" && (
        <div className={cn("absolute top-0 left-0 right-0 h-0.5", intentBar)} />
      )}

      <div className="flex items-start justify-between mb-3 gap-2">
        {Icon && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-primary)]">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
        )}
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[length:var(--ts-xs)] font-bold tabular-nums",
              deltaBgColor,
              deltaTextColor,
            )}
          >
            {isNeutralDelta ? (
              <Minus className="h-3 w-3" strokeWidth={2} aria-hidden />
            ) : isPositiveDelta ? (
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} aria-hidden />
            ) : (
              <ArrowDownRight className="h-3 w-3" strokeWidth={2} aria-hidden />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>

      <p className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none mb-1">
        {prefix && typeof value === "number" && (
          <span className="text-sm font-bold text-[var(--text-tertiary)]">{prefix}</span>
        )}
        {typeof value === "number" ? value.toLocaleString("es-PE") : value}
      </p>

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {label}
        </p>
        {deltaLabel && (
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">{deltaLabel}</p>
        )}
      </div>

      {subValue && (
        <p className="mt-1 text-xs text-[var(--text-tertiary)] tabular-nums">{subValue}</p>
      )}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-3">
          <InlineSparkline data={sparkline} up={sparklineUp} />
        </div>
      )}
    </div>
  );
});
