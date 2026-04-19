"use client";

/**
 * ChartCard — wrapper unificado para todos los charts del admin Inicio.
 *
 * Responsabilidades:
 *  - Card minimalista (bg blanco/dark, rule-soft, rounded-xl)
 *  - Header con icono + titulo + opcional badge / timeframe selector
 *  - Slot para children con altura fija (resuelve Recharts width=-1 en ResponsiveContainer)
 *  - Empty state opcional via prop `isEmpty` + `emptyText`
 *
 * Uso:
 *   <ChartCard title="Ventas y Utilidad" Icon={TrendingUp} height={340}>
 *     <ResponsiveContainer width="100%" height="100%">
 *       <AreaChart data={data}>...</AreaChart>
 *     </ResponsiveContainer>
 *   </ChartCard>
 */

import { CardTitle } from "@buleje/design-system";
import { BarChart3 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ComponentType, ReactNode } from "react";

interface ChartCardProps {
  title: string;
  /** Icono del header (opcional). */
  Icon?: ComponentType<{ className?: string }>;
  /** Altura del slot del chart en px. Default 280. Pasar 0 para que crezca segun children. */
  height?: number;
  /** Slot derecho del header (badge, timeframe selector, link). */
  badge?: ReactNode;
  /** Subtitulo bajo el titulo. */
  subtitle?: string;
  /** Si true, muestra empty state en lugar de children. */
  isEmpty?: boolean;
  /** Texto del empty state. */
  emptyText?: string;
  /** Icono del empty state. */
  EmptyIcon?: ComponentType<{ className?: string }>;
  /** Clase extra en el wrapper del card (ej. lg:col-span-3). */
  className?: string;
  /** Clase extra en el wrapper del chart (height container). */
  chartClassName?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  Icon,
  height = 280,
  badge,
  subtitle,
  isEmpty = false,
  emptyText = "Sin datos",
  EmptyIcon = BarChart3,
  className,
  chartClassName,
  children,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-card border border-[var(--rule-soft)] dark:border-card-border rounded-xl p-5 flex flex-col",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 min-w-0">
          {Icon && (
            <Icon className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <CardTitle className="font-display text-base font-semibold italic text-[var(--text-primary)] dark:text-foreground truncate tracking-tight">
              {title}
            </CardTitle>
            {subtitle && (
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {isEmpty ? (
        <EmptyState text={emptyText} Icon={EmptyIcon} height={height} />
      ) : (
        <div
          className={cn("w-full", chartClassName)}
          style={height > 0 ? { height: `${height}px` } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  text,
  Icon,
  height,
}: {
  text: string;
  Icon: ComponentType<{ className?: string }>;
  height: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]"
      style={height > 0 ? { height: `${height}px` } : { padding: "3rem 0" }}
    >
      <Icon className="h-8 w-8 mb-2" aria-hidden="true" />
      <p className="text-xs font-medium">{text}</p>
    </div>
  );
}

/**
 * ChartTooltip — tooltip unificado para Recharts (custom content).
 * Usar como `<Tooltip content={<ChartTooltip prefix="S/" />} />`.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  prefix = "",
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value: number; color?: string; fill?: string }[];
  label?: string;
  prefix?: string;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl px-3 py-2 text-xs shadow-sm">
      {label && (
        <p className="font-semibold text-[var(--text-primary)] dark:text-foreground mb-1">
          {label}
        </p>
      )}
      {payload.map((p, i) => {
        const value =
          typeof p.value === "number"
            ? formatter
              ? formatter(p.value)
              : prefix === "S/"
                ? `S/ ${p.value.toFixed(2)}`
                : `${prefix}${p.value.toLocaleString("es-PE")}`
            : `${p.value}`;
        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: p.color || p.fill || "#94a3b8" }}
            />
            <span className="text-[var(--text-secondary)] dark:text-muted">
              {p.name}:
            </span>
            <span className="font-bold text-[var(--text-primary)] dark:text-foreground">
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Tokens de chart compartidos — paleta Holded-style, sin saturados hardcoded. */
export const CHART_TOKENS = {
  grid: "#f1f5f9",
  tickFill: "#94a3b8",
  axisFontSize: 10,
  // Brand y data palette desde design-system tokens (mapeados a hex porque Recharts no soporta CSS vars en SVG).
  brand: "#00B4A6",
  blue: "#3b82f6",
  emerald: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  red: "#ef4444",
  cyan: "#06b6d4",
  orange: "#f97316",
  gray: "#94a3b8",
} as const;
