"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to monitoring (logger is server-only, so we use fetch)
    fetch("/api/admin/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        digest: error.digest,
        source: "admin-error-boundary",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-8 shadow-lg text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          Algo salio mal
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Hubo un error en el panel de administracion. Intenta recargar la pagina.
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
          <a
            href="/admin"
            className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
