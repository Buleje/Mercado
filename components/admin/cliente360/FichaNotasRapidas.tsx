"use client";

import { CheckCircle, Loader2, FileText } from "@buleje/design-system/icons";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Notas rápidas (observaciones) con guardado automático. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaNotasRapidas({ ficha }: { ficha: Cliente360 }) {
  const {
    observaciones, obsExpanded, setObsExpanded, savingObs, obsSaved, handleObservacionesChange,
  } = ficha;
  return (
    <>
      {/* Mejora 10R2: Notas rapidas (observaciones) */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <button
          onClick={() => setObsExpanded(!obsExpanded)}
          className="w-full px-4 sm:px-5 py-3 flex items-center justify-between hover:bg-[var(--surface-alt)] transition-colors"
        >
          <span className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--data-warning-500)]" />
            Observaciones
            {observaciones && <span className="h-2 w-2 rounded-full bg-[var(--data-warning-500)] inline-block" />}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{obsExpanded ? "\u25B2" : "\u25BC"}</span>
        </button>
        {obsExpanded && (
          <div className="px-4 sm:px-5 pb-4 space-y-2">
            <textarea
              value={observaciones}
              onChange={e => handleObservacionesChange(e.target.value)}
              placeholder="Prefiere delivery lunes, Alergico al mani, etc."
              rows={3}
              className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 bg-[var(--surface-alt)] text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center gap-2 text-xs">
              {savingObs && <span className="text-[var(--text-tertiary)] flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</span>}
              {obsSaved && <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Guardado</span>}
              <span className="text-[var(--text-tertiary)] dark:text-muted ml-auto">Auto-guarda al escribir</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
