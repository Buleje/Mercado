"use client";

import React from "react";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

interface HoldedKPIProps {
  title: string;
  period?: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  objective?: number;
  objectiveLabel?: string;
  trend?: { value: number; label?: string };
  dot?: string;
  chart?: React.ReactNode;
  className?: string;
  size?: "default" | "large";
}

const DOT_COLORS: Record<string, string> = {
  emerald: "bg-[var(--accent-soft)]",
  red: "bg-[var(--data-error)]",
  amber: "bg-[var(--data-warning)]",
  blue: "bg-[var(--text-secondary)]",
  purple: "bg-[var(--text-primary)]",
  orange: "bg-[var(--data-warning)]",
  gray: "bg-gray-500",
};

function HoldedKPI({
  title,
  period,
  value,
  prefix,
  suffix,
  objective,
  objectiveLabel,
  trend,
  dot,
  chart,
  className,
  size = "default",
}: HoldedKPIProps) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-zinc-900 border border-[var(--rule-base)] dark:border-zinc-800 rounded-xl p-6",
        size === "large" && "col-span-2",
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            {dot && (
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  DOT_COLORS[dot] ?? "bg-gray-500"
                )}
              />
            )}
            <CardTitle className="text-sm font-semibold">
              {title}
            </CardTitle>
          </div>
          {period && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{period}</p>
          )}
        </div>
        {objective !== undefined && (
          <div className="text-right">
            <p className="text-xs text-[var(--text-tertiary)]">
              {objectiveLabel ?? "Objetivo"}
            </p>
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {prefix}
              {objective.toLocaleString("es-PE")}
            </p>
          </div>
        )}
      </div>

      <p className="text-3xl font-bold text-[var(--text-primary)]">
        {prefix}
        {typeof value === "number"
          ? value.toLocaleString("es-PE", { minimumFractionDigits: 2 })
          : value}
        {suffix && (
          <span className="text-lg font-normal text-[var(--text-tertiary)] ml-1">
            {suffix}
          </span>
        )}
      </p>

      {trend && (
        <div className="flex items-center gap-2 mt-2">
          <span
            className={cn(
              "text-xs font-medium",
              trend.value >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]"
            )}
          >
            {trend.value >= 0 ? "\u25B2" : "\u25BC"}{" "}
            {Math.abs(trend.value)}%
          </span>
          {trend.label && (
            <span className="text-xs text-[var(--text-tertiary)]">{trend.label}</span>
          )}
        </div>
      )}

      {chart && <div className="mt-4">{chart}</div>}
    </div>
  );
}

export default React.memo(HoldedKPI);
