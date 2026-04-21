"use client";

/**
 * @buleje/design-system/dashboard — ChartCard
 *
 * Wrapper canónico para gráficos en el dashboard admin.
 * Cero hex — solo tokens CSS.
 *
 * @example
 * <ChartCard eyebrow="Ventas" title="Ingresos del período" icon={DollarSign}>
 *   <AreaChart ... />
 * </ChartCard>
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "../icons";
import { cn } from "../utils";

export type ChartCardTone = "neutral" | "accent" | "warning" | "danger";
export type ChartCardVariant = "default" | "compact";

export interface ChartCardProps {
  /** Texto pequeño encima del título — categoría o unidad. */
  eyebrow?: string;
  /** Título principal de la carta. */
  title: string;
  /** Subtítulo o descripción corta. */
  subtitle?: string;
  /** Ícono Lucide junto al título. */
  icon?: LucideIcon;
  /** Altura fija del área del chart. Default 200. */
  height?: number;
  /** Contenido del chart (Recharts, SVG, etc.). */
  children: ReactNode;
  /**
   * Tono semántico — cambia el ribbon/accent del encabezado.
   * - neutral (default) — borde izquierdo con var(--rule-base)
   * - accent — var(--data-success)
   * - warning — var(--data-warning)
   * - danger — var(--data-error)
   */
  tone?: ChartCardTone;
  /**
   * Variante de densidad:
   * - default — padding p-4 sm:p-5
   * - compact — padding p-3
   */
  variant?: ChartCardVariant;
  /**
   * Cuando se usa en grid de 2 cols, spanWide hace que ocupe 2 columnas
   * (añade la clase col-span-2 al wrapper externo).
   */
  spanWide?: boolean;
  /** Slot de acción a la derecha del header (botón, badge, etc.). */
  action?: ReactNode;
  className?: string;
}

const TONE_RIBBON: Record<ChartCardTone, string> = {
  neutral: "border-l-[var(--rule-base)]",
  accent:  "border-l-[var(--data-success)]",
  warning: "border-l-[var(--data-warning)]",
  danger:  "border-l-[var(--data-error)]",
};

const TONE_ICON: Record<ChartCardTone, string> = {
  neutral: "text-[var(--text-secondary)]",
  accent:  "text-[var(--data-success)]",
  warning: "text-[var(--data-warning)]",
  danger:  "text-[var(--data-error)]",
};

const VARIANT_PAD: Record<ChartCardVariant, string> = {
  default: "p-4 sm:p-5",
  compact: "p-3",
};

export function ChartCard({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  height = 200,
  children,
  tone = "neutral",
  variant = "default",
  spanWide = false,
  action,
  className,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-l-4 bg-[var(--surface-raised)]",
        "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
        TONE_RIBBON[tone],
        spanWide && "col-span-2",
        VARIANT_PAD[variant],
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <Icon
              className={cn("h-4 w-4 shrink-0", TONE_ICON[tone])}
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[length:var(--ts-2xs)] font-medium uppercase tracking-wide text-[var(--text-tertiary)] leading-none mb-0.5">
                {eyebrow}
              </p>
            )}
            <p className="text-xs font-bold text-[var(--text-primary)] leading-tight truncate">
              {title}
            </p>
            {subtitle && (
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0 ml-2">{action}</div>}
      </div>

      {/* Chart area */}
      <div style={{ height }} className="w-full">
        {children}
      </div>
    </div>
  );
}
