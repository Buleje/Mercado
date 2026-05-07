"use client";

export default function RecetasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <div className="text-4xl mb-3">👨‍🍳</div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Error al cargar recetas
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          No pudimos cargar las recetas. Intenta de nuevo.
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-[var(--data-success-600)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--data-success-700)]"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
