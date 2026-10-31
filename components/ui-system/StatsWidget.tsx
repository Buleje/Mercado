"use client";

/**
 * StatsWidget — Widget de KPIs animados con delta comparativo.
 *
 * Para dashboards (admin, home del user, socio buleje). Cada card muestra:
 *   - Label pequeño
 *   - Valor grande con CountUp
 *   - Delta vs periodo anterior (↑ +12% o ↓ -3%)
 *   - Sparkline trend opcional
 *   - Icon contextual
 *
 * Uso:
 *   <StatsWidget
 *     label="Ventas hoy"
 *     value={1250}
 *     previousValue={1100}
 *     format="currency"
 *     icon={<TrendingUp />}
 *     trend={[80, 100, 90, 120, 110, 125]}
 *   />
 */

import { TrendingUp, TrendingDown, Minus } from "@buleje/design-system/icons";
import CountUp from "./CountUp";
import { formatSoles } from "@/lib/chart-helpers";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  previousValue?: number;
  /** Format. Default "number" */
  format?: "number" | "currency" | "percent";
  /** Icon del header */
  icon?: React.ReactNode;
  /** Subtitulo/hint ("Ultimas 24h", "vs. ayer", etc) */
  subtitle?: string;
  /** Trend data para sparkline ASCII (6-10 puntos) */
  trend?: number[];
  /** Si el delta positivo es bueno (default) o malo (ej. tasa de errores) */
  positiveTrendIsGood?: boolean;
  /** Variant visual. Default "default" */
  variant?: "default" | "featured" | "compact";
  className?: string;
}

function formatValue(value: number, format: Props["format"]): string {
  if (format === "currency") return formatSoles(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString("es-PE");
}

export default function StatsWidget({
  label,
  value,
  previousValue,
  format = "number",
  icon,
  subtitle,
  trend,
  positiveTrendIsGood = true,
  variant = "default",
  className,
}: Props) {
  const hasDelta = previousValue !== undefined && previousValue !== 0;
  const delta = hasDelta ? ((value - previousValue) / previousValue) * 100 : 0;
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const isGood = (isPositive && positiveTrendIsGood) || (isNegative && !positiveTrendIsGood);

  const DeltaIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2",
          className,
        )}
      >
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{label}</p>
          <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
            {format === "currency" || format === "percent" ? (
              formatValue(value, format)
            ) : (
              <CountUp to={value} duration={800} />
            )}
          </p>
        </div>
        {hasDelta && (
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold tabular-nums",
              isGood ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "bg-[var(--data-error,_#e11d48)]/10 text-[var(--data-error,_#e11d48)]",
            )}
          >
            <DeltaIcon className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4",
        variant === "featured" && "border-[var(--accent)] bg-primary/10",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
        {icon && (
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
              variant === "featured"
                ? "bg-[var(--accent)] text-[var(--surface-canvas)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
            )}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none tracking-tight">
          {format === "currency" ? (
            <>
              <span className="text-xl">S/</span>
              <CountUp to={Math.round(value)} duration={1000} />
            </>
          ) : format === "percent" ? (
            <>
              <CountUp to={Math.round(value)} duration={1000} />
              <span className="text-xl">%</span>
            </>
          ) : (
            <CountUp to={value} duration={1000} />
          )}
        </p>
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
              isGood ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "bg-[var(--data-error,_#e11d48)]/10 text-[var(--data-error,_#e11d48)]",
            )}
          >
            <DeltaIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>

      {subtitle && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{subtitle}</p>}

      {/* Sparkline */}
      {trend && trend.length > 1 && (
        <Sparkline data={trend} positive={isGood} className="mt-3" />
      )}
    </div>
  );
}

function Sparkline({
  data,
  positive,
  className,
}: {
  data: number[];
  positive: boolean;
  className?: string;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  const color = positive ? "var(--accent)" : "var(--data-error, #e11d48)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full h-6", className)} aria-hidden>
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
