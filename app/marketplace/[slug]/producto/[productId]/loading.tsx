export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Back nav */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product image */}
          <div className="aspect-square rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />

          {/* Product info */}
          <div className="space-y-4">
            <div className="h-7 w-3/4 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
            <div className="h-5 w-1/3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-10 w-28 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
            <div className="space-y-2 pt-4">
              <div className="h-4 w-full bg-gray-100 dark:bg-gray-800/60 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-gray-100 dark:bg-gray-800/60 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-100 dark:bg-gray-800/60 rounded animate-pulse" />
            </div>
            <div className="h-12 w-full bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse mt-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
