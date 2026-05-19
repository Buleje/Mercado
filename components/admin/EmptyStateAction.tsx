"use client";

import { CardTitle } from "@buleje/design-system";
/**
 * EmptyStateAction.tsx — Roadmap item #52
 *
 * Componente reutilizable de empty state con CTA accionable.
 * Reemplaza los "No hay datos" planos con guia al usuario.
 */

import { cn } from "@/lib/utils";
import type { LucideIcon } from "@buleje/design-system/icons";

interface EmptyStateActionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

export default function EmptyStateAction({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className,
}: EmptyStateActionProps) {
  const ActionTag = actionHref ? "a" : "button";

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-muted" />
      </div>

      <CardTitle className="text-base font-bold text-[var(--text-primary)] mb-1">{title}</CardTitle>
      <p className="text-sm text-muted max-w-xs mb-4">{description}</p>

      {actionLabel && (
        <ActionTag
          onClick={onAction}
          href={actionHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          {actionLabel}
        </ActionTag>
      )}
    </div>
  );
}
