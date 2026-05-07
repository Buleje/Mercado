"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const chip = tv({
  base: [
    "inline-flex items-center gap-1.5",
    "text-xs font-semibold whitespace-nowrap",
    "rounded-full border",
    "transition-colors duration-[var(--dur-fast)]",
  ],
  variants: {
    variant: {
      neutral: [
        "bg-[var(--surface-raised)]",
        "text-[var(--text-secondary)]",
        "border-[var(--rule-base)]",
        "hover:border-gray-900 dark:hover:border-gray-400",
      ],
      solid: [
        "bg-gray-900 dark:bg-white",
        "text-white dark:text-gray-900",
        "border-gray-900 dark:border-white",
      ],
      muted: [
        "bg-[var(--surface-sunken)]",
        "text-[var(--text-secondary)]",
        "border-transparent",
      ],
      accent: [
        "bg-primary/10 text-primary",
        "border-primary/20",
      ],
      success: [
        "bg-emerald-50 dark:bg-emerald-950/30",
        "text-[var(--data-success-700)] dark:text-emerald-400",
        "border-emerald-200 dark:border-emerald-900",
      ],
      warning: [
        "bg-amber-50 dark:bg-amber-950/30",
        "text-[var(--data-warning-700)] dark:text-amber-400",
        "border-amber-200 dark:border-amber-900",
      ],
      danger: [
        "bg-red-50 dark:bg-red-950/30",
        "text-[var(--data-error-700)] dark:text-red-400",
        "border-red-200 dark:border-red-900",
      ],
      ghost: [
        "bg-transparent text-[var(--text-tertiary)]",
        "border-transparent",
      ],
    },
    size: {
      xs: "h-5 px-2 text-[length:var(--ts-2xs)]",
      sm: "h-6 px-2.5 text-[length:var(--ts-xs)]",
      md: "h-7 px-3 text-xs",
      lg: "h-8 px-3.5 text-xs",
    },
  },
  defaultVariants: {
    variant: "neutral",
    size: "md",
  },
});

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chip> {}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span ref={ref} className={chip({ variant, size, className })} {...props} />
  ),
);
Chip.displayName = "Chip";
