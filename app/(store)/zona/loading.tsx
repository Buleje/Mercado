export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      {/* Hero / título */}
      <header className="text-center space-y-3 animate-pulse">
        <div className="inline-block h-7 w-52 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto" />
        <div className="h-9 w-80 mx-auto bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-4 w-64 mx-auto bg-gray-100 dark:bg-gray-600 rounded-full" />
        <div className="h-4 w-48 mx-auto bg-gray-100 dark:bg-gray-600 rounded-full" />
      </header>

      {/* CTA principal */}
      <div className="text-center animate-pulse">
        <div className="inline-block h-12 w-48 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto" />
        <div className="h-3 w-40 mx-auto mt-2 bg-gray-100 dark:bg-gray-600 rounded-full" />
      </div>

      {/* Grid de zonas / ciudades */}
      <section className="space-y-4">
        <div className="h-5 w-56 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse"
            >
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="h-3 w-32 bg-gray-100 dark:bg-gray-600 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Features grid skeleton */}
      <section className="space-y-4">
        <div className="h-5 w-72 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-center animate-pulse space-y-2"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 mx-auto" />
              <div className="h-3.5 w-20 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="h-3 w-full bg-gray-100 dark:bg-gray-600 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Links de otras zonas */}
      <section className="space-y-3 animate-pulse">
        <div className="h-3 w-36 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-6 w-20 bg-gray-100 dark:bg-gray-700 rounded-full"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
