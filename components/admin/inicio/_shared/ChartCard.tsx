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
 *     <ResponsiveContainer minWidth={0} width="100%" height="100%">
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
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && (
            <Icon className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <CardTitle className="font-display text-lg sm:text-xl font-bold text-[var(--text-primary)] dark:text-foreground truncate tracking-tight">
              {title}
            </CardTitle>
            {subtitle && (
              <p className="text-sm font-medium text-[var(--text-tertiary)] dark:text-muted mt-1 truncate">
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
          // min-w-0 evita que el padre flex haga overflow y deje a Recharts
          // medir width=-1 (warning "width and height should be greater than 0").
          className={cn("w-full min-w-0", chartClassName)}
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
      <Icon className="h-9 w-9 mb-2" aria-hidden="true" />
      <p className="text-sm font-semibold">{text}</p>
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
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl px-4 py-3 text-sm shadow-md min-w-[180px]">
      {label && (
        <p className="font-bold text-[var(--text-primary)] dark:text-foreground mb-1.5 text-base">
          {label}
        </p>
      )}
      {payload.map((p, i) => {
        const value =
          typeof p.value === "number"
            ? formatter
              ? formatter(p.value)
              : prefix === "S/"
                ? `S/ ${Number(p.value).toFixed(2)}`
                : `${prefix}${p.value.toLocaleString("es-PE")}`
            : `${p.value}`;
        return (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: p.color || p.fill || "var(--data-3)" }}
            />
            <span className="text-[var(--text-secondary)] dark:text-muted font-medium">
              {p.name}:
            </span>
            <span className="font-extrabold text-[var(--text-primary)] dark:text-foreground tabular-nums ml-auto">
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tokens de chart compartidos — alineados al Design System.
 *
 * Recharts SVG no soporta CSS vars en runtime, así que mantenemos
 * referencias var() para los elementos no-SVG (grid stroke, ticks)
 * y hex sincronizados con --data-* tokens en globals.css para los
 * fills de SVG. Si un token cambia en globals.css, actualizar acá.
 *
 * Mapping con globals.css (light): --data-1..8 + --data-success/warning/error.
 *
 * Tipografía: bumped 10→13 (alineado con CHART_FONT.axisSize en
 * components/ui-system/charts/palette.ts) para que admin desktop tenga
 * labels legibles. tickFill subido a slate-500 para mejor contraste.
 */
export const CHART_TOKENS = {
  grid: "var(--rule-soft, #f1f5f9)",
  tickFill: "var(--text-secondary, #525252)",
  axisFontSize: 14,
  axisFontWeight: 600,
  labelFontSize: 14,
  // Sincronizados con --data-* en app/globals.css (light theme).
  brand: "var(--accent)",      // --data-5
  blue: "#0ea5e9",       // --data-6 (info)
  emerald: "#047857",    // --data-success
  violet: "#8b5cf6",     // --data-8
  amber: "#d97706",      // --data-7
  red: "#b91c1c",        // --data-error
  cyan: "#06b6d4",
  orange: "#f97316",
  gray: "#a3a3a3",       // --data-3
  // Aliases semánticos vs neutrales del DS.
  primary:   "#0a0a0a",  // --data-1
  secondary: "#525252",  // --data-2
  tertiary:  "#a3a3a3",  // --data-3
  accent:    "var(--accent)",  // --data-5 (brand teal)
} as const;
