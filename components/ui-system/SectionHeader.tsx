"use client";

import { cn } from "@/lib/utils";
import { Eyebrow } from "./Eyebrow";

interface Props {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  align?: "left" | "center";
  ruled?: boolean;
  className?: string;
}

const TITLE_SIZES = {
  sm: "text-xl sm:text-2xl",
  md: "text-2xl sm:text-3xl",
  lg: "text-3xl sm:text-4xl lg:text-5xl",
};

/**
 * SectionHeader — Editorial section header pattern.
 * Eyebrow + title (tight tracking) + optional description + optional action on the right.
 * Optional horizontal rule under.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  size = "md",
  align = "left",
  ruled = false,
  className,
}: Props) {
  return (
    <header
      className={cn(
        ruled && "pb-4 border-b border-[var(--rule-base)] mb-6",
        "flex flex-col sm:flex-row sm:items-end gap-4",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <div className={cn("flex-1", align === "center" && "max-w-2xl mx-auto")}>
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h2
          className={cn(
            "font-extrabold tracking-[var(--ls-tight)] leading-[1.05] text-[var(--text-primary)]",
            TITLE_SIZES[size],
          )}
        >
          {title}
        </h2>
        {description && (
          <div className="mt-2 text-sm text-[var(--text-tertiary)] max-w-xl leading-relaxed">
            {description}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
