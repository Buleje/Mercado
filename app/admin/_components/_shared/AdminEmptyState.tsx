"use client";

/**
 * AdminEmptyState — empty state compacto para todo el panel admin.
 * Estilo: icono Lucide gris + titulo + descripcion + accion opcional.
 *
 * Sin ilustracion (deciso de UX para mantener admin sobrio).
 */

import type { ComponentType, ReactNode } from "react";
import { ADMIN_TOKENS } from "./admin-tokens";

type LucideIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

interface AdminEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Boton primario opcional. Si solo pasas onClick + label, usa btnPrimary. */
  action?: { label: string; onClick: () => void } | ReactNode;
  /** Variante compacta (menos padding) para empty states intra-tab. */
  compact?: boolean;
}

export default function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: AdminEmptyStateProps) {
  const padding = compact ? "py-8 px-6" : "py-12 px-8";
  const isActionObject =
    action != null &&
    typeof action === "object" &&
    "label" in (action as object) &&
    "onClick" in (action as object);

  return (
    <div
      className={`rounded-xl border border-dashed border-[var(--rule-soft)] bg-[var(--surface-canvas)] flex flex-col items-center justify-center text-center ${padding}`}
    >
      <span
        aria-hidden
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] mb-3"
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <p className={`${ADMIN_TOKENS.headingH3} mb-1`}>{title}</p>
      {description && (
        <p className={`${ADMIN_TOKENS.bodyText} max-w-sm`}>{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {isActionObject ? (
            <button
              type="button"
              onClick={(action as { onClick: () => void }).onClick}
              className={ADMIN_TOKENS.btnPrimary}
            >
              {(action as { label: string }).label}
            </button>
          ) : (
            (action as ReactNode)
          )}
        </div>
      )}
    </div>
  );
}
