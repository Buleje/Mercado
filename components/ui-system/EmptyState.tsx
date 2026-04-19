"use client";

import { cn } from "@/lib/utils";

interface Props {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  illustration?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: "py-10",
  md: "py-16",
  lg: "py-24",
};

/**
 * EmptyState — Editorial empty state.
 * Replaces generic "emoji + text" empty states.
 * Illustrations should be line-art SVG (no emojis).
 */
export function EmptyState({
  eyebrow,
  title,
  description,
  illustration,
  action,
  secondaryAction,
  size = "md",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        SIZE[size],
        className,
      )}
    >
      {illustration && (
        <div className="mb-6 text-gray-300 dark:text-gray-700">{illustration}</div>
      )}
      {eyebrow && (
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400">
          {eyebrow}
        </p>
      )}
      <h3 className="font-display mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] max-w-sm italic">
        {title}
      </h3>
      {description && (
        <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
