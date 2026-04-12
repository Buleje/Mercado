export default function Loading() {
  return (
    <>
      {/* Spacer igual al header fijo */}
      <div className="h-[6.75rem] sm:h-[7.75rem]" />

      <main>
        {/* Banner superior skeleton */}
        <section className="py-6 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="h-32 sm:h-40 w-full animate-pulse bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          </div>
        </section>

        {/* Sección de productos populares skeleton */}
        <section className="py-8 px-4">
          <div className="max-w-7xl mx-auto">
            {/* Título de sección */}
            <div className="flex items-center justify-between mb-5">
              <div className="h-6 w-48 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="h-4 w-20 animate-pulse bg-gray-100 dark:bg-gray-600 rounded-full" />
            </div>
            {/* Grid de 4 productos populares */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-pulse"
                >
                  <div className="aspect-square bg-gray-200 dark:bg-gray-700" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-600 rounded-full" />
                    <div className="h-5 w-1/2 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-8 w-full bg-gray-200 dark:bg-gray-700 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Catálogo principal skeleton */}
        <section className="py-8 px-4 bg-gray-50 dark:bg-gray-900/50">
          <div className="max-w-7xl mx-auto">
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="h-11 w-full sm:w-64 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="h-11 w-full sm:w-48 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="h-11 w-full sm:w-36 animate-pulse bg-gray-100 dark:bg-gray-600 rounded-xl" />
            </div>

            {/* Categorías pills */}
            <div className="flex gap-2 mb-6 overflow-hidden">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-8 w-24 shrink-0 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-full"
                />
              ))}
            </div>

            {/* Grid de productos — 8 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-pulse"
                >
                  <div className="aspect-square bg-gray-200 dark:bg-gray-700" />
                  <div className="p-3 space-y-2.5">
                    <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-3 w-2/3 bg-gray-100 dark:bg-gray-600 rounded-full" />
                    <div className="flex items-center justify-between mt-1">
                      <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                      <div className="h-4 w-12 bg-gray-100 dark:bg-gray-600 rounded-full" />
                    </div>
                    <div className="h-9 w-full bg-gray-200 dark:bg-gray-700 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
