export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header placeholder */}
      <div className="h-[6.75rem] sm:h-[7.75rem]" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5 pb-28">
        {/* Perfil: avatar + datos */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 animate-pulse">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="h-3.5 w-28 bg-gray-100 dark:bg-gray-600 rounded-full" />
              <div className="h-3 w-24 bg-gray-100 dark:bg-gray-600 rounded-full" />
            </div>
            <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" />
          </div>
        </div>

        {/* Stats de lealtad / tier */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 animate-pulse text-center space-y-2"
            >
              <div className="h-7 w-10 mx-auto bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="h-2.5 w-16 mx-auto bg-gray-100 dark:bg-gray-600 rounded-full" />
            </div>
          ))}
        </div>

        {/* Tabs skeleton */}
        <div className="flex gap-1.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex-1 h-9 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl"
            />
          ))}
        </div>

        {/* Contenido tab activa — lista de pedidos */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  <div className="h-2.5 w-44 bg-gray-100 dark:bg-gray-600 rounded-full" />
                </div>
                <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0" />
              </div>
            </div>
          ))}
        </div>

        {/* Sección favoritos / listas guardadas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 animate-pulse space-y-3">
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-20 bg-gray-100 dark:bg-gray-700 rounded-xl"
              />
            ))}
          </div>
        </div>

        {/* Direcciones guardadas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 animate-pulse space-y-3">
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-2.5 w-32 bg-gray-100 dark:bg-gray-600 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
