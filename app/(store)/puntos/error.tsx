"use client";

import { Trophy } from "@buleje/design-system/icons";

export default function PuntosError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-[var(--rule-soft)] bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-4">
          <Trophy className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Error
        </p>
        <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
          No pudimos cargar tus puntos
        </h2>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          No pudimos cargar tu programa de lealtad.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-[var(--text-primary)] px-5 py-2.5 text-sm font-bold hover:bg-gray-800 dark:hover:bg-[var(--surface-sunken)] transition-colors"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
