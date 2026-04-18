"use client";
import { cn } from "@/lib/utils";

interface Props {
  rows?: number;
  cols?: number;
  className?: string;
}

export default function TableSkeleton({ rows = 5, cols = 4, className }: Props) {
  return (
    <div className={cn("animate-pulse space-y-3 p-4", className)}>
      {/* Header */}
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className={cn("h-3 bg-[var(--surface-sunken)] rounded", c === 0 ? "flex-[2]" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}
