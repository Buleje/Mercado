"use client";

/**
 * ActionableEmptyState — estado vacío del admin con acción clara.
 *
 * Cuando una lista del admin está vacía (sin productos, sin pedidos,
 * sin clientes), este componente muestra:
 *   · ilustración grande
 *   · título Feynman ("Aún no tienes productos en el catálogo")
 *   · descripción que explica por qué importa
 *   · 1-2 CTAs específicas (no genérico "Empezar")
 *   · tips opcionales de setup
 *
 * No confundir con components/ui-system/EmptyState.tsx (customer-facing).
 * Este es para el admin y tiene layout más denso.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: LucideIcon;
  /** Estilo primario (accent sólido) o secundario (outline). */
  primary?: boolean;
}

interface Tip {
  icon?: LucideIcon;
  text: string;
}

interface Props {
  /** Icono grande decorativo. */
  icon: LucideIcon;
  /** Eyebrow pequeño uppercase. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Hasta 2 CTAs. Primera con `primary: true`. */
  actions?: Action[];
  /** Tips ajustables de setup (bullet list). */
  tips?: Tip[];
  className?: string;
}

export function ActionableEmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  tips,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]",
        className,
      )}
    >
      <div className="h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-tertiary)] mb-4">
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </div>

      {eyebrow && (
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
          {eyebrow}
        </p>
      )}

      <h3 className="font-display text-xl font-normal text-[var(--text-primary)] tracking-tight max-w-md">
        {title}
      </h3>

      {description && (
        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed max-w-md">
          {description}
        </p>
      )}

      {actions && actions.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actions.map((a, i) => {
            const ActionIcon = a.icon;
            const Wrapper = a.href ? "a" : "button";
            const baseCls = cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
              a.primary
                ? "bg-[var(--accent-600,var(--accent))] text-white hover:opacity-90"
                : "border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
            );

            return (
              <Wrapper
                key={i}
                {...(a.href ? { href: a.href } : { onClick: a.onClick, type: "button" as const })}
                className={baseCls}
              >
                {ActionIcon && <ActionIcon className="h-4 w-4" strokeWidth={1.75} />}
                {a.label}
              </Wrapper>
            );
          })}
        </div>
      )}

      {tips && tips.length > 0 && (
        <ul className="mt-6 pt-4 border-t border-[var(--rule-soft)] space-y-1.5 max-w-sm w-full text-left">
          {tips.map((tip, i) => {
            const TipIcon = tip.icon;
            return (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-tertiary)]">
                {TipIcon && <TipIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />}
                <span>{tip.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ActionableEmptyState;
