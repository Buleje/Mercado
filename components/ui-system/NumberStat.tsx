"use client";

import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { Kicker } from "./Kicker";

interface Props {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  format?: Intl.NumberFormatOptions;
  locales?: string;
  delta?: {
    value: number;
    label?: string;
    direction?: "up" | "down" | "neutral";
  };
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "center";
  className?: string;
}

const SIZE = {
  sm: "text-2xl",
  md: "text-3xl sm:text-4xl",
  lg: "text-4xl sm:text-5xl",
  xl: "text-5xl sm:text-6xl lg:text-7xl",
};

/**
 * NumberStat — Large animated number with editorial kicker label above.
 * Used for KPIs, dashboards, hero stats. Replaces generic "icon-bg+label" cards.
 */
export function NumberStat({
  label,
  value,
  prefix,
  suffix,
  format = { maximumFractionDigits: 0 },
  locales = "es-PE",
  delta,
  size = "md",
  align = "left",
  className,
}: Props) {
  const direction = delta?.direction ?? (delta
    ? delta.value > 0
      ? "up"
      : delta.value < 0
      ? "down"
      : "neutral"
    : undefined);

  return (
    <div
      className={cn(
        "flex flex-col",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <Kicker>{label}</Kicker>
      <div
        className={cn(
          "mt-1.5 font-extrabold tracking-[var(--ls-tight)] tabular-nums leading-none",
          "text-gray-900 dark:text-white",
          SIZE[size],
        )}
      >
        {prefix}
        <NumberFlow
          value={value}
          format={format as React.ComponentProps<typeof NumberFlow>["format"]}
          locales={locales}
        />
        {suffix}
      </div>
      {delta && (
        <p
          className={cn(
            "mt-2 text-[length:var(--ts-xs)] font-semibold tabular-nums",
            direction === "up" && "text-emerald-600 dark:text-emerald-400",
            direction === "down" && "text-red-600 dark:text-red-400",
            direction === "neutral" && "text-gray-500",
          )}
        >
          {direction === "up" && "↑ "}
          {direction === "down" && "↓ "}
          {delta.value > 0 ? "+" : ""}
          {delta.value}
          {delta.label && <span className="ml-1 text-gray-400">{delta.label}</span>}
        </p>
      )}
    </div>
  );
}
