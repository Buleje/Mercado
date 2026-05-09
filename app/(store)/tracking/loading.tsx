export default function Loading() {
  return (
    <main className="min-h-screen bg-background dark:bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Título */}
        <div className="mb-8 text-center space-y-2 animate-pulse">
          <div className="h-8 w-52 mx-auto bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl" />
          <div className="h-4 w-72 mx-auto bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
        </div>

        {/* Formulario de búsqueda */}
        <div className="flex flex-col gap-2 sm:flex-row animate-pulse">
          <div className="flex-1 h-12 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl" />
          <div className="flex-1 h-12 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl" />
          <div className="h-12 w-full sm:w-24 bg-[var(--rule-base)] dark:bg-[var(--surface-raised)] rounded-xl" />
        </div>

        {/* Resultado de pedido — header */}
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-4 animate-pulse">
            <div className="space-y-1.5">
              <div className="h-2.5 w-12 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
              <div className="h-4 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
            <div className="h-6 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            <div className="space-y-1.5 text-right">
              <div className="h-2.5 w-10 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
              <div className="h-4 w-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
          </div>

          {/* Timeline skeleton */}
          <div className="rounded-xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-5 animate-pulse space-y-2">
            <div className="h-3 w-28 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full mb-4" />
            <ul className="space-y-0">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Línea vertical */}
                  {i < 4 && (
                    <span className="absolute left-4 top-8 h-full w-0.5 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] -translate-x-1/2" />
                  )}
                  {/* Círculo */}
                  <div className="relative z-10 w-8 h-8 rounded-full border-2 border-gray-200 dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] shrink-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[var(--rule-base)] dark:bg-[var(--surface-raised)]" />
                  </div>
                  {/* Texto */}
                  <div className="pb-2 space-y-1.5 pt-1">
                    <div className="h-3.5 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                    <div className="h-3 w-48 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Productos skeleton */}
          <div className="rounded-xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-5 animate-pulse space-y-3">
            <div className="h-3 w-20 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-3.5 w-36 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                <div className="h-3.5 w-10 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
