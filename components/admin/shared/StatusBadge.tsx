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

const variantStyles: Record<BadgeVariant, { badge: string; dot: string }> = {
  success: {
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  warning: {
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  error: {
    badge: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
  },
  info: {
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
  },
  neutral: {
    badge: "bg-gray-50 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400",
    dot: "bg-gray-400 dark:bg-zinc-500",
  },
  pending: {
    badge: "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400",
    dot: "bg-violet-500 dark:bg-violet-400",
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
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
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
