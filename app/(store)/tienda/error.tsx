"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function TiendaError({
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] dark:text-white">Error al cargar la tienda</h2>
          <p className="mt-2 text-sm text-[var(--text-tertiary)] dark:text-muted">
            No pudimos cargar los productos. Verifica tu conexión e intenta de nuevo.
          </p>
        </div>
        <button
          onClick={reset}
          className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-opacity"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
