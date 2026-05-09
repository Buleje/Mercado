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
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[var(--surface-canvas)] border border-gray-200 dark:border-[var(--rule-soft)] p-8 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-[var(--rule-soft)] bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-5">
          <Store className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Error
        </p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--text-primary)] dark:text-white">
          No pudimos cargar el Marketplace
        </h1>
        <p className="mt-2 text-sm text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] leading-relaxed">
          Tu conexión puede estar intermitente. Intentá de nuevo en un momento.
        </p>
        {error.digest && (
          <p className="mt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono tabular-nums">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={reset}
            className="rounded-full bg-gray-900 dark:bg-white text-white dark:text-[var(--text-primary)] px-5 py-2.5 text-sm font-bold hover:bg-gray-800 dark:hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-full border border-gray-200 dark:border-[var(--rule-base)] px-5 py-2.5 text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] hover:border-gray-900 dark:hover:border-gray-400 transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
