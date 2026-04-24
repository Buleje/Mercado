"use client";

/**
 * MicroList — lista top-N con bar proportion inline.
 *
 * Para mostrar "Top 5 productos" o "Top proveedores" en cards pequeños,
 * con un mini-bar de fondo proporcional al valor máximo.
 *
 * Uso:
 *   <MicroList
 *     items={[
 *       { name: "Coca Cola 1.5L", value: 320, label: "S/ 320" },
 *       { name: "Pan Frances", value: 240, label: "S/ 240" },
 *     ]}
 *     barColor="#00B4A6"
 *   />
 */

import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

export interface MicroListItem {
  /** Nombre/label principal. */
  name: string;
  /** Valor numerico para la proporcion del bar. */
  value: number;
  /** Texto a la derecha (ej. "S/ 320" o "12 uds"). */
  label?: string;
  /** Sublabel debajo del name (ej. categoria). */
  sublabel?: string;
  /** Override de color del bar para este item. */
  color?: string;
  /** Icono opcional a la derecha (ej. trending up). */
  TrailIcon?: ComponentType<{ className?: string }>;
  /** Color del trailing icon. */
  trailIconClass?: string;
}

interface MicroListProps {
  items: MicroListItem[];
  /** Color base del bar de fondo. Default brand. */
  barColor?: string;
  /** Mostrar número de ranking (1, 2, 3...) a la izquierda. */
  showRank?: boolean;
  /** Texto cuando items esta vacio. */
  emptyText?: string;
}

export function MicroList({
  items,
  barColor = "#00B4A6",
  showRank = true,
  emptyText = "Sin datos",
}: MicroListProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-6">
        {emptyText}
      </p>
    );
  }
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-2 w-full">
      {items.map((item, i) => {
        const pct = (item.value / maxValue) * 100;
        const color = item.color ?? barColor;
        return (
          <div key={i} className="relative">
            {/* Bar de fondo */}
            <div
              className="absolute inset-0 rounded-md opacity-10"
              style={{ width: `${pct}%`, backgroundColor: color }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-2 py-1.5 px-2">
              {showRank && (
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0",
                    i < 3
                      ? "bg-gray-900 dark:bg-foreground text-white dark:text-background"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                  )}
                >
                  {i + 1}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-foreground truncate leading-tight">
                  {item.name}
                </p>
                {item.sublabel && (
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted leading-tight">
                    {item.sublabel}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.label && (
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground tabular-nums">
                    {item.label}
                  </span>
                )}
                {item.TrailIcon && (
                  <item.TrailIcon
                    className={cn("h-3 w-3", item.trailIconClass ?? "text-[var(--text-tertiary)]")}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
