"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function BuscarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg className="h-8 w-8 text-[var(--data-warning-500)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Error en la búsqueda</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-muted">
            Ocurrió un error al buscar. Intenta de nuevo.
          </p>
        </div>
        <button onClick={reset} className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-opacity">
          Reintentar
        </button>
      </div>
    </div>
  );
}
