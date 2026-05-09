export default function Loading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
      {/* Header: botón back + título */}
      <div className="flex items-center gap-3 mb-6 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] shrink-0" />
        <div className="h-6 w-28 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-lg" />
      </div>

      {/* Transparency banner skeleton */}
      <div className="rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-4 animate-pulse space-y-2">
        <div className="h-4 w-48 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
        <div className="h-3 w-full bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
        <div className="h-3 w-5/6 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
      </div>

      {/* Score card skeleton */}
      <div className="rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-5 animate-pulse space-y-4">
        {/* Score gauge area */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            <div className="h-12 w-20 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl" />
          </div>
          <div className="w-24 h-24 rounded-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)]" />
        </div>

        {/* Crédito disponible / usado */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
              <div className="h-5 w-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
          ))}
        </div>

        {/* Barra de progreso */}
        <div className="h-2 w-full bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-[var(--rule-base)] dark:bg-[var(--surface-raised)] rounded-full" />
        </div>
      </div>

      {/* Tips skeleton */}
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-4 animate-pulse space-y-2">
        <div className="h-4 w-44 bg-amber-200 dark:bg-amber-800/40 rounded-full" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 w-full bg-amber-100 dark:bg-amber-800/20 rounded-full" />
        ))}
      </div>

      {/* Historial de score skeleton */}
      <div className="rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-4 animate-pulse space-y-3">
        <div className="h-4 w-36 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)]/50 px-3 py-2.5"
          >
            <div className="h-6 w-14 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-lg" />
            <div className="h-3 w-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
        ))}
      </div>

      {/* Desglose skeleton */}
      <div className="rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-4 animate-pulse space-y-3">
        <div className="h-4 w-40 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-2.5 w-36 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
              <div className="h-2.5 w-12 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
            <div className="h-1.5 w-full bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
