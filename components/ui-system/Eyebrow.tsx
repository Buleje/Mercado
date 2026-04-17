"use client";

import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLParagraphElement> {
  as?: "p" | "span" | "div";
  variant?: "default" | "muted" | "accent";
}

/**
 * Eyebrow — Small uppercase label above titles.
 * Editorial kicker pattern. Replace "badge with emoji" everywhere.
 */
export function Eyebrow({
  as: Comp = "p",
  variant = "default",
  children,
  className,
  ...rest
}: Props) {
  return (
    <Comp
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.18em]",
        variant === "default" && "text-gray-500 dark:text-gray-400",
        variant === "muted" && "text-gray-400",
        variant === "accent" && "text-primary",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}
