"use client";

import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  as?: "h2" | "h3" | "h4";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

/**
 * RuledTitle — Section title with trailing horizontal rule (editorial pattern).
 * Usage: <RuledTitle>Productos destacados</RuledTitle>
 */
export function RuledTitle({ children, as: Comp = "h3", size = "md", className }: Props) {
  return (
    <Comp
      className={cn(
        "flex items-baseline gap-4 font-extrabold tracking-tight text-gray-900 dark:text-white",
        SIZES[size],
        className,
      )}
    >
      <span className="shrink-0">{children}</span>
      <span className="flex-1 h-px bg-gray-200 dark:bg-gray-800 translate-y-[-4px]" />
    </Comp>
  );
}
