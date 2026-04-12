"use client";

import Link from "next/link";

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        <div className="text-4xl mb-4">🏪</div>
        <h1 className="text-xl font-bold text-gray-800">
          Error en el Marketplace
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          No pudimos cargar las tiendas. Intenta de nuevo.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-gray-400 font-mono">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
