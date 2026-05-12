"use client";

/**
 * components/admin/EmptyState.tsx — VARIANTE admin (actions[] array).
 *
 * ⚠️  OJO: existen 3 EmptyState con APIs distintas:
 *   - components/admin/EmptyState.tsx         ← este (prop `actions[]`)
 *   - components/admin/shared/EmptyState.tsx  (SVG illustrations + `variant`)
 *   - components/ui-system/EmptyState.tsx     (`eyebrow, action, secondaryAction`)
 *
 * NO son intercambiables. Audit: `npm run dev:duplicates`.
 *
 * Props:
 *  - icon      — ReactNode (icono lucide u otro)
 *  - title     — Título principal del estado vacío
 *  - description — Texto secundario opcional
 *  - actions   — Array de botones accionables: { label, href | onClick }
 */

import Link from "next/link";
import type { ReactNode } from "react";

export type EmptyStateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions = [],
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center py-14 px-6",
        "bg-[var(--surface-raised)] border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)]",
        "rounded-xl",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon && (
        <div className="mb-4 text-[var(--text-tertiary)] dark:text-muted [&_svg]:h-10 [&_svg]:w-10 [&_svg]:mx-auto">
          {icon}
        </div>
      )}

      <p className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-base leading-snug">
        {title}
      </p>

      {description && (
        <p className="text-sm text-[var(--text-tertiary)] dark:text-muted mt-1.5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          {actions.map((action, i) => {
            const isPrimary = action.variant !== "secondary";
            const baseClass = [
              "min-h-11 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              isPrimary
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--rule-soft)] dark:hover:bg-card-border",
            ].join(" ");

            if (action.href) {
              return (
                <Link key={i} href={action.href} className={baseClass}>
                  {action.label}
                </Link>
              );
            }
            return (
              <button key={i} onClick={action.onClick} className={baseClass} type="button">
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
