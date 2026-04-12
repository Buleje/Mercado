export default function Loading() {
  return (
    <main className="min-h-screen bg-background dark:bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Título */}
        <div className="mb-8 text-center space-y-2 animate-pulse">
          <div className="h-8 w-52 mx-auto bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-4 w-72 mx-auto bg-gray-100 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Formulario de búsqueda */}
        <div className="flex flex-col gap-2 sm:flex-row animate-pulse">
          <div className="flex-1 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="flex-1 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-12 w-full sm:w-24 bg-gray-300 dark:bg-gray-600 rounded-xl" />
        </div>

        {/* Resultado de pedido — header */}
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse">
            <div className="space-y-1.5">
              <div className="h-2.5 w-12 bg-gray-100 dark:bg-gray-600 rounded-full" />
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
            <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="space-y-1.5 text-right">
              <div className="h-2.5 w-10 bg-gray-100 dark:bg-gray-600 rounded-full" />
              <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
          </div>

          {/* Timeline skeleton */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 animate-pulse space-y-2">
            <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded-full mb-4" />
            <ul className="space-y-0">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Línea vertical */}
                  {i < 4 && (
                    <span className="absolute left-4 top-8 h-full w-0.5 bg-gray-100 dark:bg-gray-700 -translate-x-1/2" />
                  )}
                  {/* Círculo */}
                  <div className="relative z-10 w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 shrink-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                  </div>
                  {/* Texto */}
                  <div className="pb-2 space-y-1.5 pt-1">
                    <div className="h-3.5 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-3 w-48 bg-gray-100 dark:bg-gray-600 rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Productos skeleton */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 animate-pulse space-y-3">
            <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-3.5 w-36 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-3.5 w-10 bg-gray-100 dark:bg-gray-600 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
