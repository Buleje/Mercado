"use client";

/**
 * MultiMetricCard — card combo de alto nivel que integra en una sola vista:
 *  - Eyebrow + título editorial
 *  - Valor principal grande (hero metric)
 *  - Delta vs período anterior con arrow + %
 *  - Sparkline inline (tendencia últimos N puntos)
 *  - Progress bar hacia meta (opcional)
 *  - 2-4 métricas secundarias con iconos grises
 *  - Badge contextual (Excelente/Aceptable/Revisar)
 *
 * Diseñado para el admin Inicio. Reemplaza 3-4 cards simples con 1 que
 * cuenta la historia completa del KPI.
 *
 * Uso:
 *   <MultiMetricCard
 *     eyebrow="Ventas · Hoy"
 *     title="Ventas del día"
 *     value={fmt(ventasHoy)}
 *     delta={{ value: 12.5, label: "vs ayer" }}
 *     spark={data.sparkVentas}
 *     target={{ current: ventasHoy, goal: 2000, label: "Meta diaria" }}
 *     secondary={[
 *       { icon: ShoppingCart, label: "Tickets", value: "24" },
 *       { icon: DollarSign, label: "Prom.", value: fmt(prom) },
 *     ]}
 *     badge={{ label: "Al día", intent: "success" }}
 *   />
 */

import type { LucideIcon } from "@buleje/design-system/icons";
import { TrendingUp, TrendingDown, Minus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface SecondaryMetric {
  icon: LucideIcon;
  label: string;
  value: string;
}

interface Props {
  eyebrow?: string;
  title: string;
  /** Valor principal (ej: "S/ 1,250.00"). */
  value: string;
  /** Subtítulo pequeño bajo el valor. */
  caption?: string;
  /** Delta vs período anterior. */
  delta?: {
    value: number;
    /** Default: "%" */
    suffix?: string;
    /** Etiqueta ("vs ayer", "vs mes pasado"). */
    label?: string;
  };
  /** Sparkline inline — array de valores, renderiza SVG compacto. */
  spark?: number[];
  /** Color del sparkline. Default: accent. */
  sparkColor?: string;
  /** Progress hacia meta. */
  target?: {
    current: number;
    goal: number;
    label?: string;
  };
  /** Hasta 4 métricas secundarias bajo el valor. */
  secondary?: SecondaryMetric[];
  /** Badge de estado. */
  badge?: {
    label: string;
    intent: "success" | "warning" | "error" | "neutral";
  };
  /** Clase extra al card. */
  className?: string;
  /** Click handler (hace el card interactivo). */
  onClick?: () => void;
}

const INTENT_COLORS = {
  success: "bg-[var(--accent-soft)] text-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-50)] text-[var(--data-error-500)]",
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

export function MultiMetricCard({
  eyebrow,
  title,
  value,
  caption,
  delta,
  spark,
  sparkColor = "var(--accent)",
  target,
  secondary,
  badge,
  className,
  onClick,
}: Props) {
  const Wrapper = onClick ? "button" : "div";
  const progress = target
    ? Math.min(100, Math.max(0, (target.current / target.goal) * 100))
    : null;

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 text-left transition-all",
        onClick && "hover:border-[var(--rule-strong)] hover:shadow-sm",
        className,
      )}
    >
      {/* Header — eyebrow + badge */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              {eyebrow}
            </p>
          )}
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </p>
        </div>
        {badge && (
          <span
            className={cn(
              "shrink-0 text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
              INTENT_COLORS[badge.intent],
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Valor principal + delta */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="font-display text-3xl sm:text-4xl font-normal text-[var(--text-primary)] leading-none tracking-tight tabular-nums">
          {value}
        </p>
        {delta && <DeltaBadge delta={delta} />}
      </div>

      {caption && (
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">{caption}</p>
      )}

      {/* Sparkline */}
      {spark && spark.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline values={spark} color={sparkColor} />
        </div>
      )}

      {/* Progress hacia meta */}
      {target && progress !== null && (
        <div className="mt-3">
          {target.label && (
            <div className="flex items-center justify-between text-[length:var(--ts-2xs)] mb-1">
              <span className="text-[var(--text-tertiary)]">{target.label}</span>
              <span className="font-semibold text-[var(--text-secondary)] tabular-nums">
                {progress.toFixed(0)}%
              </span>
            </div>
          )}
          <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                progress >= 100
                  ? "bg-[var(--data-success-500)]"
                  : progress >= 66
                    ? "bg-[var(--accent)]"
                    : progress >= 33
                      ? "bg-[var(--data-warning-500)]"
                      : "bg-[var(--data-error-500)]",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Secundarias */}
      {secondary && secondary.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--rule-soft)] grid grid-cols-2 gap-3">
          {secondary.slice(0, 4).map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className="min-w-0">
                <div className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-semibold uppercase tracking-wider mb-0.5">
                  <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{m.label}</span>
                </div>
                <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums truncate">
                  {m.value}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Wrapper>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: NonNullable<Props["delta"]> }) {
  const Icon = delta.value === 0 ? Minus : delta.value > 0 ? TrendingUp : TrendingDown;
  const color =
    delta.value === 0
      ? "text-[var(--text-secondary)] bg-[var(--surface-sunken)]"
      : delta.value > 0
        ? "text-[var(--data-success-500)] bg-[var(--accent-soft)]"
        : "text-[var(--data-error-500)] bg-[var(--data-error-50)]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md tabular-nums",
        color,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {Math.abs(delta.value).toFixed(1)}
      {delta.suffix ?? "%"}
      {delta.label && (
        <span className="font-medium text-[var(--text-tertiary)] ml-1">
          {delta.label}
        </span>
      )}
    </span>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  // Fill area gradient (de los puntos al bottom)
  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="w-full h-8"
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polyline
        points={areaPoints}
        fill={`url(#spark-grad-${color})`}
        stroke="none"
        transform="scale(1, 0.3)"
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="scale(1, 0.3)"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
