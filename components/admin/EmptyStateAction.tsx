"use client";

/**
 * EmptyStateAction.tsx — Roadmap item #52
 *
 * Componente reutilizable de empty state con CTA accionable.
 * Reemplaza los "No hay datos" planos con guia al usuario.
 */

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

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
      <div className="h-16 w-16 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-muted" />
      </div>

      <h3 className="text-base font-bold text-foreground mb-1">{title}</h3>
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
