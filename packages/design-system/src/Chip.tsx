"use client";

import { memo } from "react";
import type { ReactNode } from "react";
import { cn } from "./utils";

/**
 * Chip — filter/tag chip uniforme.
 *
 * Parte del design system (ADR-068/069). 3 estados: inactive/active/disabled.
 * Uso tipico: filtros de busqueda, tags de categoria, toggle buttons.
 *
 * Regla de armonia:
 * - Inactive: surface-sunken bg + rule-base border + text-secondary
 * - Active: text-primary bg + surface-canvas text + elev-1
 * - Disabled: opacity 40 + cursor-not-allowed
 */
type Size = "sm" | "md";

type Props = {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  count?: number;
  size?: Size;
  className?: string;
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1 text-[length:var(--ts-xs)]",
  md: "px-4 py-1.5 text-xs",
};

export const Chip = memo(function Chip({
  children,
  active = false,
  disabled = false,
  onClick,
  count,
  size = "md",
  className,
}: Props) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-[var(--ls-wider)] whitespace-nowrap",
        "transition-all duration-[var(--dur-fast)]",
        SIZE_CLASSES[size],
        active
          ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] elev-1"
          : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]",
        disabled && "opacity-40 cursor-not-allowed",
        className,
      )}
    >
      {children}
      {count != null && count > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[length:var(--ts-2xs)] font-bold tabular-nums",
            active
              ? "bg-[var(--surface-canvas)]/20 text-[var(--surface-canvas)]"
              : "bg-[var(--rule-base)] text-[var(--text-tertiary)]",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
});
