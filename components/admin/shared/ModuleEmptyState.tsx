"use client";
/**
 * ModuleEmptyState — Empty state minimalista estandar del admin.
 *
 * Pattern usado desde commit dc262046 en Turnos, Caja, Cuadre, Comisiones,
 * Fiados (libreta vacia). En vez de duplicar el markup con iconos/headers/etc
 * 20+ veces, centralizamos aqui.
 *
 * Uso básico:
 *   <ModuleEmptyState icon={Clock} title="Sin turnos registrados"
 *     description="Abre tu primer turno para empezar." />
 *
 * Con CTA:
 *   <ModuleEmptyState icon={Calculator} title="Sin cuadres" description="..."
 *     cta={{ label: "Ir a Control de turnos", onClick: handleNav, icon: ArrowRight }} />
 */

import type { LucideIcon } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

export interface ModuleEmptyStateProps {
  /** Icono Lucide (ej. Clock, Calculator, FileText). */
  icon: LucideIcon;
  /** Titulo principal del empty state. */
  title: string;
  /** Descripcion breve (1-2 lineas). */
  description: string;
  /** CTA opcional abajo de la descripcion. */
  cta?: {
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: LucideIcon;
  };
  /** Contenedor wrapper (default: card blanca). */
  variant?: "card" | "bare";
  className?: string;
}

export function ModuleEmptyState({
  icon: Icon,
  title,
  description,
  cta,
  variant = "card",
  className,
}: ModuleEmptyStateProps) {
  const CtaIcon = cta?.icon;
  return (
    <div
      className={cn(
        "py-12 px-4 text-center",
        variant === "card" && "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl",
        className,
      )}
    >
      <div className="h-12 w-12 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-3">
        <Icon className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
      </div>
      <CardTitle className="text-base font-semibold text-[var(--text-primary)] mb-1">{title}</CardTitle>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">{description}</p>
      {cta && (
        cta.href ? (
          <a
            href={cta.href}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            {cta.label}
            {CtaIcon && <CtaIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
          </a>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
          >
            {CtaIcon && <CtaIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
            {cta.label}
          </button>
        )
      )}
    </div>
  );
}

export default ModuleEmptyState;
