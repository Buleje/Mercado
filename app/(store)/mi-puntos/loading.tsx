export default function Loading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>

      {/* Score / puntos principal */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          {/* Puntos totales */}
          <div className="space-y-2">
            <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-14 w-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            <div className="h-3 w-24 bg-gray-100 dark:bg-gray-600 rounded-full" />
          </div>
          {/* Badge tier */}
          <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Barra de progreso al siguiente tier */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <div className="h-2.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-2.5 w-20 bg-gray-100 dark:bg-gray-600 rounded-full" />
          </div>
          <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full w-2/5 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>
        </div>
      </div>

      {/* Grid de stats */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 animate-pulse space-y-2 text-center"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 mx-auto" />
            <div className="h-5 w-14 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-2.5 w-20 mx-auto bg-gray-100 dark:bg-gray-600 rounded-full" />
          </div>
        ))}
      </div>

      {/* Rewards disponibles */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse space-y-3">
        <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden"
            >
              <div className="h-16 bg-gray-200 dark:bg-gray-700" />
              <div className="p-2.5 space-y-1.5">
                <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-3 w-2/3 bg-gray-100 dark:bg-gray-600 rounded-full" />
                <div className="h-6 w-full bg-gray-200 dark:bg-gray-700 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historial de puntos */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse space-y-3">
        <div className="h-4 w-44 bg-gray-200 dark:bg-gray-700 rounded-full" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600" />
              <div className="space-y-1">
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-600 rounded-full" />
                <div className="h-2.5 w-20 bg-gray-100 dark:bg-gray-600 rounded-full" />
              </div>
            </div>
            <div className="h-5 w-12 bg-gray-200 dark:bg-gray-600 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
