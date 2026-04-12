"use client";

import Link from "next/link";

export default function MisPedidosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <div className="text-4xl mb-3">📦</div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Error al cargar tus pedidos
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          No pudimos cargar tu historial. Intenta de nuevo.
        </p>
        <div className="mt-4 flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Reintentar
          </button>
          <Link
            href="/cuenta"
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Mi cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}
