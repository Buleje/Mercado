"use client";

import { cn } from "@/lib/utils";

interface AIModuleSkeletonProps {
  rows?: number;
  className?: string;
}

const ROW_WIDTHS = [75, 90, 65, 82, 70, 88];

export function AIModuleSkeleton({ rows = 4, className }: AIModuleSkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 ",
        className
      )}
    >
      {/* Header skeleton */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
      {/* Rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse"
              style={{ width: `${ROW_WIDTHS[i % ROW_WIDTHS.length]}%`, animationDelay: `${i * 100}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AIModuleCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 ",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-1" />
          <div className="h-3 w-48 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 rounded-lg bg-gray-50 dark:bg-gray-800/50 animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
