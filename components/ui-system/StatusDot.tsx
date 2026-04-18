"use client";

import { cn } from "@/lib/utils";

type Status = "success" | "warning" | "error" | "muted" | "accent" | "info";

interface Props {
  status?: Status;
  pulse?: boolean;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

const COLORS: Record<Status, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  info: "bg-sky-500",
  muted: "bg-gray-400 dark:bg-gray-600",
  accent: "bg-primary",
};

/**
 * StatusDot — Small colored dot + optional label.
 * Replaces "full colored bg" status indicators.
 * Ej: <StatusDot status="success" label="Activo" />
 */
export function StatusDot({
  status = "muted",
  pulse = false,
  label,
  size = "sm",
  className,
}: Props) {
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        className,
      )}
    >
      <span
        className={cn(
          "relative inline-flex rounded-full shrink-0",
          dotSize,
          COLORS[status],
        )}
      >
        {pulse && (
          <span
            className={cn(
              "absolute inset-0 rounded-full animate-ping opacity-50",
              COLORS[status],
            )}
          />
        )}
      </span>
      {label && <span className="text-[var(--text-secondary)]">{label}</span>}
    </span>
  );
}
