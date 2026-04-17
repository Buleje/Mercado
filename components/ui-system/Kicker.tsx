"use client";

import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLParagraphElement> {
  as?: "p" | "span" | "div";
}

/**
 * Kicker — Smaller uppercase with wider tracking (more editorial).
 * Used above section titles or as data label.
 */
export function Kicker({ as: Comp = "p", children, className, ...rest }: Props) {
  return (
    <Comp
      className={cn(
        "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 dark:text-gray-500",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}
