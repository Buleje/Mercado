export default function Loading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] shrink-0" />
        <div className="h-6 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-lg" />
      </div>

      {/* Score / puntos principal */}
      <div className="rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-5 animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          {/* Puntos totales */}
          <div className="space-y-2">
            <div className="h-3 w-20 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            <div className="h-14 w-28 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl" />
            <div className="h-3 w-24 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
          {/* Badge tier */}
          <div className="w-20 h-20 rounded-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)]" />
        </div>

        {/* Barra de progreso al siguiente tier */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <div className="h-2.5 w-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            <div className="h-2.5 w-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
          <div className="h-2.5 w-full bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full overflow-hidden">
            <div className="h-full w-2/5 bg-[var(--rule-base)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
        </div>
      </div>

      {/* Grid de stats */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-[var(--surface-sunken)] rounded-2xl border border-gray-100 dark:border-[var(--rule-base)] p-4 animate-pulse space-y-2 text-center"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] mx-auto" />
            <div className="h-5 w-14 mx-auto bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            <div className="h-2.5 w-20 mx-auto bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
        ))}
      </div>

      {/* Rewards disponibles */}
      <div className="rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-4 animate-pulse space-y-3">
        <div className="h-4 w-36 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 dark:border-[var(--rule-base)] overflow-hidden"
            >
              <div className="h-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)]" />
              <div className="p-2.5 space-y-1.5">
                <div className="h-3 w-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                <div className="h-3 w-2/3 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
                <div className="h-6 w-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historial de puntos */}
      <div className="rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-4 animate-pulse space-y-3">
        <div className="h-4 w-44 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)]/50 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)]" />
              <div className="space-y-1">
                <div className="h-3 w-32 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                <div className="h-2.5 w-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
              </div>
            </div>
            <div className="h-5 w-12 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
