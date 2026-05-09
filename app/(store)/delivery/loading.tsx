export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)]">
      {/* Header repartidor skeleton */}
      <div className="bg-[var(--rule-base)] dark:bg-[var(--surface-sunken)] px-4 py-4 flex items-center justify-between sticky top-0 z-10 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--rule-base)] dark:bg-[var(--surface-raised)]" />
          <div className="space-y-1.5">
            <div className="h-4 w-28 bg-[var(--rule-base)] dark:bg-[var(--surface-raised)] rounded-full" />
            <div className="h-2.5 w-20 bg-[var(--rule-base)] dark:bg-[var(--surface-raised)] rounded-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-[var(--rule-base)] dark:bg-[var(--surface-raised)] rounded-lg" />
          <div className="h-8 w-16 bg-[var(--rule-base)] dark:bg-[var(--surface-raised)] rounded-lg" />
        </div>
      </div>

      {/* Lista de entregas */}
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-[var(--surface-canvas)] rounded-2xl border border-gray-100 dark:border-[var(--rule-soft)] overflow-hidden animate-pulse"
          >
            {/* Info del cliente */}
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="h-4.5 w-36 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                  <div className="h-3.5 w-28 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
                </div>
                <div className="h-6 w-20 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
              </div>

              {/* Dirección */}
              <div className="flex items-start gap-2 bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] rounded-xl px-3 py-2.5">
                <div className="w-4 h-4 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                  <div className="h-3 w-3/4 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
                </div>
              </div>

              {/* Resumen items + pago */}
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-32 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                <div className="h-5 w-16 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="border-t border-gray-100 dark:border-[var(--rule-soft)] p-3 flex gap-2">
              <div className="flex-1 h-12 bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] rounded-xl" />
              <div className="flex-1 h-12 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
