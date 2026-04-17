"use client";

import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UnifiedSectionTitle — título unificado para secciones del admin (ADR-068 Ola U).
 *
 * Patrón único: kicker + title + description + actions opcional.
 * Reemplaza h2/h3 inconsistentes que cada módulo definía a su manera.
 *
 * Regla de armonía:
 * - Kicker: uppercase tracking-[var(--ls-wider)] text-[length:var(--ts-2xs)] tertiary
 * - Title: tracking-tight font-extrabold primary
 * - Description: text-sm text-secondary
 * - Icon: neutral, nunca colored
 * - Actions: derecha, shrink-0
 *
 * @example
 * <UnifiedSectionTitle
 *   kicker="Últimos 7 días"
 *   title="Ventas por hora"
 *   description="Distribución de ingresos a lo largo del día"
 *   Icon={Clock}
 *   actions={<button>Exportar</button>}
 * />
 */

interface Props {
  kicker?: string;
  title: string;
  description?: React.ReactNode;
  Icon?: LucideIcon;
  actions?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  align?: "left" | "center";
  className?: string;
}

const TITLE_SIZE = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg sm:text-xl",
} as const;

const MARGIN = {
  sm: "mb-3",
  md: "mb-4",
  lg: "mb-5 sm:mb-6",
} as const;

export const UnifiedSectionTitle = memo(function UnifiedSectionTitle({
  kicker,
  title,
  description,
  Icon,
  actions,
  size = "md",
  align = "left",
  className,
}: Props) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-3",
        MARGIN[size],
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start gap-3 min-w-0",
          align === "center" && "flex-1 flex-col items-center text-center",
        )}
      >
        {Icon && (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-primary)]">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              {kicker}
            </p>
          )}
          <h2
            className={cn(
              "font-extrabold tracking-tight text-[var(--text-primary)] leading-tight",
              TITLE_SIZE[size],
            )}
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
});
