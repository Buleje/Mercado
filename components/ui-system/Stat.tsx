"use client";

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  variant?: "default" | "inverse" | "bordered";
  className?: string;
}

/**
 * Stat — Simple static stat (no animation), for small label/value pairs.
 * For animated KPIs use NumberStat.
 */
export function Stat({ label, value, hint, variant = "default", className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col",
        variant === "bordered" && "px-4 py-3 border border-[var(--rule-base)] rounded-lg",
        variant === "inverse" && "text-white dark:text-gray-900",
        className,
      )}
    >
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className="mt-1 text-lg font-extrabold tabular-nums tracking-tight text-gray-900 dark:text-white">
        {value}
      </span>
      {hint && (
        <span className="text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400 mt-0.5">{hint}</span>
      )}
    </div>
  );
}
