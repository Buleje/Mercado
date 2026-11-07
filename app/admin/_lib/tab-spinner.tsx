export function TabSpinner() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[var(--rule-base)] " />
        <div>
          <div className="h-5 w-40 bg-[var(--rule-base)] rounded" />
          <div className="h-3 w-60 bg-[var(--rule-base)] rounded mt-2" />
        </div>
      </div>
      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-[var(--rule-base)] rounded-xl" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-10 w-10 bg-[var(--rule-base)] rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[var(--rule-base)] rounded w-1/2" />
              <div className="h-3 bg-[var(--rule-base)] rounded w-1/3" />
            </div>
            <div className="h-8 w-20 bg-[var(--rule-base)] rounded-lg" />
          </div>
        ))}
      </div>
      {/* Secondary content skeleton */}
      <div className="h-64 bg-[var(--rule-base)] rounded-xl" />
    </div>
  );
}
