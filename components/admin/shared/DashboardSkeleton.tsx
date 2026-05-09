"use client";

interface Props {
  kpis?: number;
  charts?: number;
  columns?: number;
}

export default function DashboardSkeleton({ kpis = 6, charts = 2, columns = 2 }: Props) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-${kpis} gap-3`}>
        {[...Array(kpis)].map((_, i) => (
          <div key={i} className="h-20 bg-[var(--rule-soft)] dark:bg-surface rounded-xl" />
        ))}
      </div>
      <div className="h-72 bg-[var(--rule-soft)] dark:bg-surface rounded-xl" />
      <div className={`grid grid-cols-${columns} gap-6`}>
        {[...Array(charts)].map((_, i) => (
          <div key={i} className="h-64 bg-[var(--rule-soft)] dark:bg-surface rounded-xl" />
        ))}
      </div>
    </div>
  );
}
