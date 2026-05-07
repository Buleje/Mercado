"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const iconBadge = tv({
  base: [
    "inline-flex items-center justify-center shrink-0",
    "transition-colors duration-[var(--dur-fast)]",
  ],
  variants: {
    variant: {
      outline: [
        "bg-[var(--surface-raised)]",
        "border border-[var(--rule-base)]",
        "text-[var(--text-secondary)]",
      ],
      solid: [
        "bg-gray-900 dark:bg-white",
        "text-white dark:text-gray-900",
      ],
      soft: [
        "bg-[var(--surface-sunken)]",
        "text-[var(--text-secondary)]",
      ],
      ghost: "bg-transparent text-[var(--text-tertiary)]",
      accent: [
        "bg-primary/10 text-primary",
      ],
    },
    size: {
      xs: "h-6 w-6 rounded-md",
      sm: "h-8 w-8 rounded-lg",
      md: "h-10 w-10 rounded-lg",
      lg: "h-12 w-12 rounded-xl",
      xl: "h-14 w-14 rounded-xl",
    },
  },
  defaultVariants: {
    variant: "outline",
    size: "md",
  },
});

export interface IconBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof iconBadge> {}

/**
 * IconBadge — Contenedor para iconos en grids, cards, KPIs.
 * Reemplaza `bg-amber-100 text-[var(--data-warning-600)]` patterns.
 */
export const IconBadge = forwardRef<HTMLDivElement, IconBadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div ref={ref} className={iconBadge({ variant, size, className })} {...props} />
  ),
);
IconBadge.displayName = "IconBadge";
