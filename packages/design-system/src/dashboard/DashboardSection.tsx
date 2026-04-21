"use client";

/**
 * @buleje/design-system/dashboard — DashboardSection
 *
 * Wrapper de sección con header eyebrow+título+acción y body con grid configurable.
 * Consume solo tokens CSS.
 */

import type { ReactNode } from "react";
import { cn } from "../utils";

export type DashboardGridCols = 1 | 2 | 3 | 4;

export interface DashboardSectionProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Slot de acción a la derecha del header (filtros, botones). */
  action?: ReactNode;
  /** Número de columnas del grid del body. Default 2. */
  cols?: DashboardGridCols;
  children: ReactNode;
  className?: string;
}

const GRID_COLS: Record<DashboardGridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function DashboardSection({
  eyebrow,
  title,
  subtitle,
  action,
  cols = 2,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          {eyebrow && (
            <p className="text-[length:var(--ts-2xs)] font-medium uppercase tracking-wide text-[var(--text-tertiary)] mb-0.5">
              {eyebrow}
            </p>
          )}
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
          {subtitle && (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Body grid */}
      <div className={cn("grid gap-3", GRID_COLS[cols])}>
        {children}
      </div>
    </section>
  );
}
