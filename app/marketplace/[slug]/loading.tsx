export default function StoreDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Banner skeleton */}
      <div className="relative h-40 sm:h-52 bg-gray-200 dark:bg-gray-800 animate-pulse">
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-gray-50 dark:from-gray-950" />
        {/* Logo circle */}
        <div className="absolute -bottom-8 left-4 sm:left-8 w-20 h-20 rounded-2xl bg-white dark:bg-gray-900 shadow-lg ring-4 ring-white dark:ring-gray-950 animate-pulse" />
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-12 pb-8">
        {/* Store name + info */}
        <div className="space-y-3 mb-8">
          <div className="h-7 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800/60 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
            <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
            <div className="h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-hidden mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-8 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse shrink-0"
              style={{ width: `${60 + (i % 3) * 20}px` }}
            />
          ))}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden animate-pulse"
            >
              <div className="h-40 bg-gray-200 dark:bg-gray-800" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
                <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-800/60" />
                <div className="h-9 w-full rounded-xl bg-gray-200 dark:bg-gray-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
