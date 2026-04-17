"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "./utils";

type Size = "sm" | "md" | "lg";
type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: Size;
  variant?: Variant;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  asChild?: boolean;
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 min-h-[32px] rounded-md",
  md: "px-4 py-2 text-sm gap-2 min-h-[40px] rounded-lg",
  lg: "px-5 py-2.5 text-sm gap-2 min-h-[44px] rounded-lg",
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90 disabled:opacity-50",
  secondary:
    "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50",
  danger:
    "bg-[var(--data-error)] text-white hover:opacity-90 disabled:opacity-50",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]";

export const PrimaryButton = forwardRef<HTMLButtonElement, Props>(function PrimaryButton(
  { size = "md", variant = "primary", leftIcon, rightIcon, loading, asChild, className, children, disabled, ...rest },
  ref,
) {
  const resolvedClassName = cn(BASE_CLASSES, SIZE_CLASSES[size], VARIANT_CLASSES[variant], className);

  if (asChild) {
    return (
      <Slot ref={ref} className={resolvedClassName} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={resolvedClassName}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
