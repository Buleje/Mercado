"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw, ArrowLeft } from "@buleje/design-system/icons";

export default function SuperAdminError({
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
    <div className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center p-4">
      <div className="bg-[var(--surface-raised)]/80 backdrop-blur-xl border border-[var(--rule-base)] rounded-3xl w-full max-w-md p-8 shadow-xl text-center">
        <div className="mx-auto w-16 h-16 rounded-xl bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-[var(--data-error)] dark:text-[var(--data-error)]" />
        </div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Algo salió mal
        </h1>
        <p className="text-[var(--text-tertiary)] text-sm mb-6">
          {error.message || "Ocurrió un error inesperado en el panel de plataforma."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
          <a
            href="/superadmin/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </a>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-600 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
