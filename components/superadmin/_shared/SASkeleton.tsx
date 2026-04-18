"use client";

// ─── Base skeleton ────────────────────────────────────────────────────────────

interface SASkeletonProps {
  className?: string;
}

export function SASkeleton({ className = "" }: SASkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded ${className}`} />
  );
}

// ─── CardGridSkeleton ─────────────────────────────────────────────────────────

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 animate-pulse"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-8 w-20 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
          <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      ))}
    </div>
  );
}

// ─── TableSkeleton ────────────────────────────────────────────────────────────

export function TableSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--rule-base)] animate-pulse">
        <div className="h-3 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={[
            "flex items-center gap-4 px-4 py-3 animate-pulse",
            i < count - 1 ? "border-b border-[var(--rule-base)]" : "",
          ].join(" ")}
        >
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-2.5 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-14 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      ))}
    </div>
  );
}

// ─── ChartSkeleton ────────────────────────────────────────────────────────────

export function ChartSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 animate-pulse"
        >
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
          <div className="h-48 w-full rounded-xl bg-[var(--surface-sunken)]" />
        </div>
      ))}
    </>
  );
}

// Legacy aliases
export { TableSkeleton as SATableSkeleton };
export function SAStatCardSkeleton() {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 shadow-sm dark:shadow-none animate-pulse">
      <SASkeleton className="h-4 w-24 mb-3" />
      <SASkeleton className="h-8 w-16 mb-1" />
      <SASkeleton className="h-3 w-20" />
    </div>
  );
}
