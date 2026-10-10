"use client";



/** Esqueleto mientras carga Inventario. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioCargando() {
  return (
    <>
      <div className="space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-11 h-11 rounded-xl bg-[var(--rule-soft)] dark:bg-accent shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-6 w-32 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
            <div className="h-4 w-56 bg-[var(--rule-soft)] dark:bg-accent rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
            <div className="h-8 w-24 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
          </div>
        </div>
        {/* Toolbar skeleton */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 flex-1 min-w-45 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
          <div className="h-9 w-28 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
          <div className="h-9 w-24 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
          <div className="h-9 w-20 bg-[var(--rule-soft)] dark:bg-accent rounded-lg" />
        </div>
        {/* KPI skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-5">
              <div className="h-3 w-1/3 bg-[var(--rule-soft)] dark:bg-accent rounded mb-3" />
              <div className="h-7 w-1/2 bg-[var(--rule-soft)] dark:bg-accent rounded mb-2" />
              <div className="h-1 w-full bg-[var(--rule-soft)] dark:bg-accent rounded mt-3" />
            </div>
          ))}
        </div>
        {/* Product row skeletons */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 p-3 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
            <div className="h-10 w-10 bg-[var(--rule-soft)] dark:bg-accent rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[var(--rule-soft)] dark:bg-accent rounded w-1/3" />
              <div className="h-3 bg-[var(--rule-soft)] dark:bg-accent rounded w-1/4" />
            </div>
            <div className="h-6 w-16 bg-[var(--rule-soft)] dark:bg-accent rounded-full" />
            <div className="h-5 w-14 bg-[var(--rule-soft)] dark:bg-accent rounded" />
          </div>
        ))}
      </div>
    </>
  );
}
