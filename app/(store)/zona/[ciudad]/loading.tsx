export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-8">
      {/* Hero: badge + título + descripción */}
      <header className="text-center space-y-3 animate-pulse">
        <div className="inline-block h-7 w-48 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full mx-auto" />
        <div className="h-10 w-72 mx-auto bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl" />
        <div className="h-4 w-full max-w-lg mx-auto bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
        <div className="h-4 w-3/4 max-w-md mx-auto bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
        <div className="h-3.5 w-64 mx-auto bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
      </header>

      {/* CTA */}
      <div className="text-center animate-pulse">
        <div className="inline-block h-12 w-48 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl mx-auto" />
        <div className="h-3 w-40 mx-auto mt-2 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
      </div>

      {/* Categorías grid */}
      <section className="space-y-4">
        <div className="h-5 w-64 mx-auto bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] p-6 animate-pulse"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)]" />
              <div className="h-4 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
              <div className="h-3 w-32 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Features skeleton */}
      <section className="space-y-4">
        <div className="h-5 w-80 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] p-4 text-center animate-pulse space-y-2"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] mx-auto" />
              <div className="h-3.5 w-20 mx-auto bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
              <div className="h-3 w-full bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* FAQ skeleton */}
      <section className="space-y-4">
        <div className="h-5 w-80 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 dark:border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] px-5 py-4 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-3/4 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                <div className="w-5 h-5 rounded bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] shrink-0 ml-4" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Otras zonas */}
      <section className="space-y-3 animate-pulse">
        <div className="h-3 w-36 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-6 w-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
          ))}
        </div>
      </section>
    </div>
  );
}
