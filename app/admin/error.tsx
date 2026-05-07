"use client";

import { PageTitle } from "@buleje/design-system";
import { useEffect } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to monitoring (logger is server-only, so we use fetch).
    // Uses public log-error endpoint — health require auth which falla en error boundary.
    fetch("/api/admin/log-error", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        error: error.message,
        digest: error.digest,
        source: "admin-error-boundary",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--surface-raised)] p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--data-warning-50)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-7 w-7" />
          </div>
        </div>
        <PageTitle className="text-xl font-bold text-[var(--text-primary)]">
          Algo salio mal
        </PageTitle>
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">
          Hubo un error en el panel de administracion. Intenta recargar la pagina.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-[var(--text-tertiary)] font-mono">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-[var(--accent-soft)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)] transition-colors"
          >
            Reintentar
          </button>
          <a
            href="/admin"
            className="rounded-lg border border-[var(--rule-base)] px-6 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
