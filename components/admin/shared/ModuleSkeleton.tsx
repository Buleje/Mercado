"use client";

export function ModuleSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-[var(--rule-soft)] dark:bg-zinc-700" />
        <div className="flex-1">
          <div className="h-6 w-40 bg-[var(--rule-soft)] dark:bg-zinc-700 rounded-lg" />
          <div className="h-4 w-64 bg-[var(--surface-sunken)] dark:bg-zinc-800 rounded mt-2" />
        </div>
      </div>
      {/* Tabs skeleton */}
      <div className="flex gap-2">
        <div className="h-10 w-24 bg-[var(--surface-sunken)] dark:bg-zinc-800 rounded-lg" />
        <div className="h-10 w-24 bg-[var(--surface-sunken)] dark:bg-zinc-800 rounded-lg" />
        <div className="h-10 w-24 bg-[var(--surface-sunken)] dark:bg-zinc-800 rounded-lg" />
      </div>
      {/* KPIs skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-[var(--surface-sunken)] dark:bg-zinc-800 rounded-xl" />
        ))}
      </div>
      {/* Content skeleton */}
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-[var(--surface-alt)] dark:bg-zinc-800/50 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default ModuleSkeleton;
