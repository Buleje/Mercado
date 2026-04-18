"use client";

import { X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export const TAG_COLORS = {
  teal:    { bg: "bg-teal-100 dark:bg-teal-900/40",    text: "text-[var(--accent)]",    dot: "bg-teal-500" },
  blue:    { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",    text: "text-[var(--data-success)] dark:text-[var(--data-success)]",    dot: "bg-[var(--accent-soft)]" },
  violet:  { bg: "bg-[var(--surface-sunken)]",text: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",dot: "bg-[var(--text-primary)]" },
  amber:   { bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/40",  text: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",  dot: "bg-[var(--data-warning)]" },
  rose:    { bg: "bg-[var(--surface-sunken)]",    text: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",    dot: "bg-[var(--text-primary)]" },
  emerald: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", text: "text-[var(--data-success)] dark:text-[var(--data-success)]", dot: "bg-[var(--accent-soft)]" },
  orange:  { bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/40",text: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",dot: "bg-[var(--data-warning)]" },
  gray:    { bg: "bg-[var(--surface-sunken)]/60",    text: "text-[var(--text-secondary)]",    dot: "bg-gray-400" },
} as const;

export type TagColor = keyof typeof TAG_COLORS;

export interface Tag {
  name: string;
  color: TagColor;
}

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export default function TagBadge({ tag, onRemove, size = "md", className }: TagBadgeProps) {
  const colors = TAG_COLORS[tag.color] ?? TAG_COLORS.gray;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium transition-colors",
        size === "sm" ? "px-2 py-0.5 text-[length:var(--ts-2xs)]" : "px-2.5 py-1 text-xs",
        colors.bg,
        colors.text,
        className,
      )}
    >
      <span className={cn("shrink-0 rounded-full", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2", colors.dot)} />
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className={cn(
            "rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors min-h-[20px] min-w-[20px] flex items-center justify-center",
          )}
          aria-label={`Quitar etiqueta ${tag.name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
