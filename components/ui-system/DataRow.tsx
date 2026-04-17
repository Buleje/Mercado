"use client";

import { cn } from "@/lib/utils";

interface Props {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  dense?: boolean;
}

/**
 * DataRow — Editorial label/value row for detail pages, settings, reviews.
 * Replaces generic "dl/dt/dd" patterns. Use in a list with rule-bottom.
 */
export function DataRow({
  label,
  value,
  hint,
  leading,
  trailing,
  onClick,
  className,
  dense,
}: Props) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4",
        "border-b border-[var(--rule-base)]",
        dense ? "py-2" : "py-3.5",
        onClick && "hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors cursor-pointer text-left",
        className,
      )}
    >
      {leading && <span className="shrink-0">{leading}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 truncate">
          {value}
        </p>
        {hint && (
          <p className="text-[length:var(--ts-xs)] text-gray-400 mt-0.5">{hint}</p>
        )}
      </div>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </Comp>
  );
}
