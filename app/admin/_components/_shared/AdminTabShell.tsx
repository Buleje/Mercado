"use client";

/**
 * AdminTabShell — wrapper canonico para cada tab del panel
 * `/admin/store-page`. Provee header consistente (icono + titulo +
 * descripcion + chip opcional + actions) y spacing fijo.
 *
 * Toda tab debe envolverse con este shell en lugar de inventar su
 * propio header.
 */

import type { ComponentType, ReactNode } from "react";
import { ADMIN_TOKENS } from "./admin-tokens";

type LucideIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

interface ChipProps {
  label: string;
  icon?: LucideIcon;
  tone?: "accent" | "muted";
}

interface AdminTabShellProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  chip?: ChipProps;
  /** Botones u otros elementos a la derecha del header. */
  actions?: ReactNode;
  children: ReactNode;
}

export default function AdminTabShell({
  title,
  description,
  icon: Icon,
  chip,
  actions,
  children,
}: AdminTabShellProps) {
  const ChipIcon = chip?.icon;
  return (
    <div className={ADMIN_TOKENS.sectionGap}>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={`${ADMIN_TOKENS.headingH2} inline-flex items-center gap-2`}>
              {Icon && (
                <Icon
                  className="h-5 w-5 text-[var(--accent)]"
                  strokeWidth={2}
                  aria-hidden
                />
              )}
              {title}
            </h2>
            {chip && (
              <span
                className={
                  chip.tone === "muted"
                    ? ADMIN_TOKENS.chipMuted
                    : ADMIN_TOKENS.chipAccent
                }
              >
                {ChipIcon && <ChipIcon className="h-3 w-3" aria-hidden />}
                {chip.label}
              </span>
            )}
          </div>
          {description && (
            <p className={`${ADMIN_TOKENS.bodyText} mt-1 max-w-3xl`}>
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </header>
      {children}
    </div>
  );
}
