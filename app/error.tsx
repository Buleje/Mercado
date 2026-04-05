"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-background p-6">
      <div className="max-w-md w-full bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-8 text-center shadow-lg">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-foreground mb-2">Algo salió mal</h2>
        <p className="text-sm text-gray-500 dark:text-muted mb-6">
          Ocurrió un error inesperado. Puedes intentar recargar la página.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-[#00B4A6] hover:bg-[#009690] text-white text-sm font-bold transition-colors"
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.href = "/"}
            className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-card text-gray-700 dark:text-foreground text-sm font-bold transition-colors"
          >
            Ir al inicio
          </button>
        </div>
        {error.digest && (
          <p className="text-xs text-gray-400 dark:text-muted mt-4">Código: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
