"use client";

import { Trophy } from "lucide-react";

export default function PuntosError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-200 mb-4">
          <Trophy className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
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
          className="mt-5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-5 py-2.5 text-sm font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
