export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background">
      {/* Hero header skeleton */}
      <div className="pt-32 sm:pt-36 pb-10 sm:pb-14 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl animate-pulse bg-white/30 dark:bg-[var(--surface-raised)]" />
            <div className="flex-1 space-y-2">
              <div className="h-7 w-40 animate-pulse bg-white/30 dark:bg-[var(--surface-raised)] rounded-lg" />
              <div className="h-3 w-20 animate-pulse bg-white/20 dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
          </div>
          {/* Stats row skeleton */}
          <div className="grid grid-cols-3 gap-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl animate-pulse bg-white/20 dark:bg-[var(--surface-raised)] p-4 text-center h-20"
              />
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 space-y-4 pb-28">
        {/* Filter tabs skeleton */}
        <div className="flex gap-1.5 bg-white dark:bg-[var(--surface-sunken)] rounded-2xl border border-gray-100 dark:border-[var(--rule-base)] p-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex-1 h-9 animate-pulse bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-xl"
            />
          ))}
        </div>

        {/* Order card skeletons */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[var(--surface-sunken)] rounded-2xl border border-gray-100 dark:border-[var(--rule-base)] p-4 animate-pulse"
            >
              <div className="flex items-center gap-3">
                {/* Status icon */}
                <div className="w-11 h-11 rounded-xl bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] shrink-0" />
                {/* Info */}
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                  <div className="h-2.5 w-40 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
                </div>
                {/* Total */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-4 w-14 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                  <div className="w-7 h-7 rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
