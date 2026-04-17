"use client";

import { cn } from "@/lib/utils";

interface Props {
  orientation?: "horizontal" | "vertical";
  variant?: "soft" | "base" | "strong";
  label?: string;
  className?: string;
}

const COLOR = {
  soft: "bg-gray-100 dark:bg-gray-900",
  base: "bg-gray-200 dark:bg-gray-800",
  strong: "bg-gray-900 dark:bg-gray-200",
};

/**
 * Divider — Minimal horizontal or vertical rule.
 * Optionally with label inline (editorial pattern).
 */
export function Divider({
  orientation = "horizontal",
  variant = "base",
  label,
  className,
}: Props) {
  if (label && orientation === "horizontal") {
    return (
      <div
        role="separator"
        className={cn("flex items-center gap-3 my-4", className)}
      >
        <span className={cn("flex-1 h-px", COLOR[variant])} />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
          {label}
        </span>
        <span className={cn("flex-1 h-px", COLOR[variant])} />
      </div>
    );
  }
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === "horizontal" ? "w-full h-px my-4" : "h-full w-px mx-4",
        COLOR[variant],
        className,
      )}
    />
  );
}
