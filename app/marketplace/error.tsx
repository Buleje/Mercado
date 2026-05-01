"use client";

import Link from "next/link";
import { Store } from "@buleje/design-system/icons";

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-200 mb-5">
          <Store className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400">
          Error
        </p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          No pudimos cargar el Marketplace
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          Tu conexión puede estar intermitente. Intentá de nuevo en un momento.
        </p>
        {error.digest && (
          <p className="mt-3 text-[length:var(--ts-2xs)] text-gray-400 font-mono tabular-nums">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={reset}
            className="rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2.5 text-sm font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-full border border-gray-200 dark:border-gray-700 px-5 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-gray-400 transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
