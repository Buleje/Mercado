/**
 * @buleje/design-system/data-display — KPIs, charts y tablas canónicas.
 *
 * @example
 * <StatCard label="Ventas" value="S/ 4,520" delta={12.5} trend="up" emphasis="success" />
 * <ChartWrapper title="Ventas por dia">
 *   <LineChart data={...} />
 * </ChartWrapper>
 * <DataTable>
 *   <thead><tr><th>Producto</th></tr></thead>
 *   <tbody>...</tbody>
 * </DataTable>
 */
"use client";

import { useEffect, useState } from "react";
import type { ReactNode, TableHTMLAttributes, HTMLAttributes } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  type LucideIcon,
} from "./icons";
import { CardTitle, Caption, Kicker } from "./typography";
import { cn } from "./utils";

// ── StatCard ──────────────────────────────────────────────────────────────────
export type StatCardEmphasis = "neutral" | "success" | "warning" | "error";
export type StatCardTrend = "up" | "down" | "neutral";

const EMPHASIS_ACCENT: Record<StatCardEmphasis, string> = {
  neutral: "var(--text-primary)",
  success: "var(--data-success)",
  warning: "var(--data-warning)",
  error: "var(--data-error)",
};

export type StatCardDensity = "compact" | "default" | "comfortable";

export interface StatCardSparkline {
  /** Serie numérica a graficar (mín 2 puntos). */
  data: number[];
  /** Override de color. Default: var(--text-secondary). */
  color?: string;
  /** Altura en px del sparkline. Default 24. */
  height?: number;
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Delta porcentual. Positivo = verde (o emphasis override), negativo = rojo. */
  delta?: number | null;
  /** Etiqueta opcional del delta (ej: "vs ayer"). */
  deltaLabel?: string;
  /** Trend explícito. Si no se da, se infiere del signo de delta. */
  trend?: StatCardTrend;
  /** Ícono a la derecha del label. */
  icon?: LucideIcon;
  /** Intent semántico. Default neutral (monocromo). */
  emphasis?: StatCardEmphasis;
  /** Sub-valor debajo del main. */
  subValue?: ReactNode;
  /**
   * Densidad vertical del card (Sprint D4).
   * - `compact` — p-3, menor altura (side modules, lists).
   * - `default` — p-5 (default, dashboards).
   * - `comfortable` — p-6, más aire (hero KPIs).
   */
  density?: StatCardDensity;
  /**
   * Mini line chart SVG inline al pie del card (Sprint D4).
   * Util para KPIs con serie temporal corta (últimos 7 días, últimas 12 hrs).
   * No depende de Recharts — render SVG puro.
   */
  sparkline?: StatCardSparkline;
  onClick?: () => void;
  className?: string;
}

const DENSITY_PADDING: Record<StatCardDensity, string> = {
  compact: "p-3",
  default: "p-5",
  comfortable: "p-6",
};

// ── Mini sparkline SVG (no deps) ────────────────────────────────────────────
function Sparkline({ data, color, height = 24 }: StatCardSparkline) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100; // viewBox width; stretches to 100% via preserveAspectRatio.
  const h = height;
  const step = w / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const strokeColor = color ?? "var(--text-secondary)";
  return (
    <svg
      className="mt-3 w-full"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Tarjeta de KPI canónica. Reemplaza los KPITile custom con colormap arbitrario.
 *
 * - Fondo siempre `--surface-raised`.
 * - Border siempre `--rule-base`.
 * - Color solo si `emphasis` != "neutral" (intencional y documentado).
 *
 * Props de expansión Sprint D4:
 * - `density` — compact/default/comfortable (altura padding).
 * - `sparkline` — mini line chart SVG al pie del card (sin deps Recharts).
 * - `onClick` — ya existía, clickable variant.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  trend: trendProp,
  icon: Icon,
  emphasis = "neutral",
  subValue,
  density = "default",
  sparkline,
  onClick,
  className,
}: StatCardProps) {
  const inferredTrend: StatCardTrend =
    trendProp ??
    (typeof delta === "number"
      ? delta > 0
        ? "up"
        : delta < 0
          ? "down"
          : "neutral"
      : "neutral");

  const TrendIcon =
    inferredTrend === "up"
      ? ArrowUpRight
      : inferredTrend === "down"
        ? ArrowDownRight
        : Minus;

  const trendColor =
    inferredTrend === "up"
      ? "var(--data-success)"
      : inferredTrend === "down"
        ? "var(--data-error)"
        : "var(--text-tertiary)";

  const Container = onClick ? "button" : "div";

  return (
    <Container
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        // Rediseño minimalista (Brandon 2026-06-10): rectangular (sin rounded),
        // fondo blanco (surface-raised), hairline border, sin sombra.
        "w-full text-left border bg-[var(--surface-raised)] border-[var(--rule-base)]",
        DENSITY_PADDING[density],
        "transition-colors",
        onClick && "hover:border-[var(--rule-strong)] cursor-pointer",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Kicker>{label}</Kicker>
          <div
            className="mt-2 text-[length:var(--ts-2xl)] font-extrabold tabular-nums leading-[var(--lh-tight)]"
            style={{ color: EMPHASIS_ACCENT[emphasis] }}
          >
            {value}
          </div>
          {subValue !== undefined && (
            <Caption className="mt-1 text-[var(--text-tertiary)]">{subValue}</Caption>
          )}
        </div>
        {/* Icono plano (sin caja redondeada) — minimalista. */}
        {Icon && (
          <Icon className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        )}
      </div>
      {(typeof delta === "number" || deltaLabel) && (
        <div className="mt-3 flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold tabular-nums">
          <TrendIcon className="h-3.5 w-3.5" style={{ color: trendColor }} aria-hidden />
          {typeof delta === "number" && (
            <span style={{ color: trendColor }}>
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
          )}
          {deltaLabel && (
            <span className="text-[var(--text-tertiary)] font-normal">{deltaLabel}</span>
          )}
        </div>
      )}
      {sparkline && sparkline.data.length >= 2 && (
        <Sparkline {...sparkline} />
      )}
    </Container>
  );
}

// ── ChartWrapper ──────────────────────────────────────────────────────────────
export interface ChartWrapperProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Contenedor canónico para gráficos. Aplica surface-raised + rule-base + padding.
 *
 * Los gráficos internos deben usar `useChartTokens()` para heredar los colores
 * semánticos del design system en lugar de hardcodearlos.
 */
export function ChartWrapper({
  title,
  description,
  actions,
  className,
  children,
  ...rest
}: ChartWrapperProps) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--surface-raised)] border-[var(--rule-base)] p-5",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title !== undefined && <CardTitle>{title}</CardTitle>}
            {description !== undefined && (
              <Caption className="mt-0.5 text-[var(--text-secondary)]">
                {description}
              </Caption>
            )}
          </div>
          {actions !== undefined && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── useChartTokens ─────────────────────────────────────────────────────────────
/**
 * Hook que resuelve tokens CSS a valores computados para uso en Recharts
 * u otras libs que no soportan `var(--...)` nativamente.
 *
 * Runtime-only (window required). En SSR devuelve fallback neutro.
 */
export function useChartTokens() {
  const [tokens, setTokens] = useState({
    axis: "#7C8AA3",
    grid: "#E5E7EB",
    stroke: "#0F172A",
    fill: "#0F172A",
    success: "#10B981",
    warning: "#ff6b5b",
    error: "#EF4444",
    info: "#3B82F6",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    setTokens({
      axis: read("--text-tertiary", "#7C8AA3"),
      grid: read("--rule-soft", "#E5E7EB"),
      stroke: read("--text-primary", "#0F172A"),
      fill: read("--text-primary", "#0F172A"),
      success: read("--data-success", "#10B981"),
      warning: read("--data-warning", "#ff6b5b"),
      error: read("--data-error", "#EF4444"),
      info: read("--data-info", "#3B82F6"),
    });
  }, []);

  return tokens;
}

// ── DataTable ─────────────────────────────────────────────────────────────────
export interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Zebra stripes on rows. */
  zebra?: boolean;
  /** Sticky header al hacer scroll. */
  stickyHeader?: boolean;
  children: ReactNode;
}

/**
 * Tabla canónica. Estiliza thead con surface-sunken y rows con hover.
 *
 * Importante: `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` se renderizan como
 * hijos — la tabla solo aplica clases base al `<table>` y a los descendientes
 * via CSS selectors (& .header, & tr, etc.).
 */
export function DataTable({
  zebra,
  stickyHeader,
  className,
  children,
  ...rest
}: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--rule-base)]">
      <table
        className={cn(
          "w-full text-[length:var(--ts-sm)] text-[var(--text-primary)]",
          "[&_thead]:bg-[var(--surface-sunken)]",
          "[&_thead_th]:px-3 [&_thead_th]:py-2.5 [&_thead_th]:text-left",
          "[&_thead_th]:font-semibold [&_thead_th]:text-[var(--text-secondary)]",
          "[&_thead_th]:text-[length:var(--ts-xs)] [&_thead_th]:uppercase [&_thead_th]:tracking-[var(--ls-wider)]",
          stickyHeader && "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10",
          "[&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--rule-soft)]",
          "[&_tbody_tr:hover]:bg-[var(--surface-sunken)]",
          "[&_tbody_td]:px-3 [&_tbody_td]:py-2.5",
          zebra && "[&_tbody_tr:nth-child(even)]:bg-[var(--surface-sunken)]/50",
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

// ── BadgeStatus ───────────────────────────────────────────────────────────────
export type BadgeStatusVariant = "success" | "warning" | "error" | "info" | "neutral" | "pending";

export interface BadgeStatusProps {
  variant: BadgeStatusVariant;
  label: string;
  size?: "sm" | "md";
  /** Punto indicador antes del label. */
  dot?: boolean;
  /** Ícono opcional antes del label. */
  icon?: LucideIcon;
  /** Animación pulse para estados activos. */
  pulse?: boolean;
  onClick?: () => void;
  className?: string;
}

const BADGE_TOKENS: Record<BadgeStatusVariant, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-[color-mix(in_oklch,var(--data-success)_12%,transparent)]",
    text: "text-[var(--data-success)]",
    dot: "bg-[var(--data-success)]",
  },
  warning: {
    bg: "bg-[color-mix(in_oklch,var(--data-warning)_12%,transparent)]",
    text: "text-[var(--data-warning)]",
    dot: "bg-[var(--data-warning)]",
  },
  error: {
    bg: "bg-[color-mix(in_oklch,var(--data-error)_12%,transparent)]",
    text: "text-[var(--data-error)]",
    dot: "bg-[var(--data-error)]",
  },
  info: {
    bg: "bg-[color-mix(in_oklch,var(--data-info)_12%,transparent)]",
    text: "text-[var(--data-info)]",
    dot: "bg-[var(--data-info)]",
  },
  neutral: {
    bg: "bg-[var(--surface-sunken)]",
    text: "text-[var(--text-secondary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
  pending: {
    bg: "bg-[var(--surface-sunken)]",
    text: "text-[var(--text-primary)]",
    dot: "bg-[var(--text-primary)]",
  },
};

/**
 * Badge de estado canónico. Reemplaza StatusBadge legacy con mapeo más claro.
 *
 * Usar variant según el intento:
 *   - success → estado positivo (pagado, aprobado, activo)
 *   - warning → alerta suave (pendiente revisión, stock bajo)
 *   - error → fallo o negativo (rechazado, error)
 *   - info → neutral informativo
 *   - neutral → sin estado específico
 *   - pending → en procesamiento / espera
 */
export function BadgeStatus({
  variant,
  label,
  size = "md",
  dot,
  icon: Icon,
  pulse,
  onClick,
  className,
}: BadgeStatusProps) {
  const tokens = BADGE_TOKENS[variant];
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        tokens.bg,
        tokens.text,
        size === "sm"
          ? "px-2 py-0.5 text-[length:var(--ts-2xs)]"
          : "px-2.5 py-0.5 text-[length:var(--ts-xs)]",
        pulse && "animate-pulse",
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className,
      )}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden />}
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", tokens.dot)} />}
      {label}
    </Tag>
  );
}
