export default function CompareLoading() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 rounded bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)]" />
          <div className="h-4 w-96 rounded bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)]" />
          <div className="mt-10 rounded-2xl border border-gray-200 dark:border-[var(--rule-soft)] overflow-hidden">
            <div className="grid grid-cols-5">
              <div className="h-14 bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] border-r border-gray-200 dark:border-[var(--rule-soft)]" />
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 bg-white dark:bg-[var(--surface-canvas)] border-r border-gray-200 dark:border-[var(--rule-soft)] last:border-r-0"
                />
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="grid grid-cols-5 border-t border-gray-200 dark:border-[var(--rule-soft)]"
              >
                <div className="h-16 bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] border-r border-gray-200 dark:border-[var(--rule-soft)]" />
                {[0, 1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className="h-16 bg-white dark:bg-[var(--surface-canvas)] border-r border-gray-200 dark:border-[var(--rule-soft)] last:border-r-0"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
