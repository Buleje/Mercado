"use client";

import { AlertTriangle, X } from "@buleje/design-system/icons";

/** Aviso de error debajo del campo (audio que no se transcribió, micrófono sin permiso). */
export function AvisoCampo({ texto, onCerrar }: { texto: string; onCerrar: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] pl-3 dark:bg-[var(--data-error-500)]/12">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
      <p className="flex-1 py-2 text-sm text-[var(--text-secondary)]">{texto}</p>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar aviso"
        title="Cerrar"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
