export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)]">
      {/* Back nav */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-[var(--surface-canvas)]/80 backdrop-blur border-b border-gray-200 dark:border-[var(--rule-soft)] px-4 py-3">
        <div className="h-5 w-32 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded animate-pulse" />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product image */}
          <div className="aspect-square rounded-2xl bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] animate-pulse" />

          {/* Product info */}
          <div className="space-y-4">
            <div className="h-7 w-3/4 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded-lg animate-pulse" />
            <div className="h-5 w-1/3 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded animate-pulse" />
            <div className="h-10 w-28 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
            <div className="space-y-2 pt-4">
              <div className="h-4 w-full bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)]/60 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)]/60 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)]/60 rounded animate-pulse" />
            </div>
            <div className="h-12 w-full bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded-xl animate-pulse mt-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
