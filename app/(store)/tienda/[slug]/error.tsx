"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export default function ProductError({
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
        <div className="mx-auto h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Producto no encontrado</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-muted">
            Este producto no existe o ya no está disponible.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={reset} className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-opacity">
            Reintentar
          </button>
          <Link href="/tienda" className="px-6 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
            Ver todos los productos
          </Link>
        </div>
      </div>
    </div>
  );
}
