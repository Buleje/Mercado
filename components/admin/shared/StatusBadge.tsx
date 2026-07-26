import React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "pending";

interface StatusBadgeProps {
  variant: BadgeVariant;
  label: string;
  size?: "sm" | "md";
  dot?: boolean;
  icon?: React.ElementType<{ className?: string }>;
  pulse?: boolean;
  onClick?: () => void;
}

/**
 * Variants 100% por tokens — ADR-074 Phase 2 (structural redesign).
 *
 * Cada variante usa:
 *   - background: mix semántico via `color-mix(in oklch, var(--data-*) 12%, transparent)`
 *     Esto respeta automáticamente dark mode porque los tokens ya cambian.
 *   - text: color puro del token
 *   - dot: color puro del token
 *
 * Ya no hay `bg-primary/10 dark:bg-primary/15` hardcoded — un rebrand
 * cambia `--data-success` y las 6 variantes siguen sin editar.
 */
const variantStyles: Record<BadgeVariant, { badge: string; dot: string }> = {
  success: {
    badge:
      "bg-[color-mix(in_oklch,var(--data-success)_12%,transparent)] text-[var(--data-success-500)]",
    dot: "bg-[var(--data-success-500)]",
  },
  warning: {
    badge:
      "bg-[color-mix(in_oklch,var(--data-warning)_12%,transparent)] text-[var(--data-warning-500)]",
    dot: "bg-[var(--data-warning-500)]",
  },
  error: {
    badge:
      "bg-[color-mix(in_oklch,var(--data-error)_12%,transparent)] text-[var(--data-error-500)]",
    dot: "bg-[var(--data-error-500)]",
  },
  info: {
    badge:
      "bg-[color-mix(in_oklch,var(--data-info)_12%,transparent)] text-[var(--data-info-500)]",
    dot: "bg-[var(--data-info-500)]",
  },
  neutral: {
    badge: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
  pending: {
    badge: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    dot: "bg-[var(--text-primary)]",
  },
};

function StatusBadge({ variant, label, size = "md", dot = false, icon: Icon, pulse = false, onClick }: StatusBadgeProps) {
  const styles = variantStyles[variant];
  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-full font-medium inline-flex items-center gap-1",
        styles.badge,
        size === "sm" ? "px-2 py-0.5 text-[length:var(--ts-2xs)]" : "px-2.5 py-0.5 text-xs",
        pulse && "animate-pulse",
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
      )}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {dot && (
        <span
          className={cn(
            "rounded-full shrink-0",
            styles.dot,
            size === "sm" ? "h-1.5 w-1.5" : "h-1.5 w-1.5",
          )}
        />
      )}
      {label}
    </Tag>
  );
}

export default React.memo(StatusBadge);
export type { BadgeVariant, StatusBadgeProps };
