"use client";

import { CardTitle } from "@buleje/design-system";
import { MessageSquare, CheckCircle, Loader2, Save } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Notas del vendedor. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaNotasVendedor({ ficha }: { ficha: Cliente360 }) {
  const {
    notes, setNotes, savingNotes, notesSaved, handleSaveNotes,
  } = ficha;
  return (
    <>
      {/* Notas del vendedor */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Notas del vendedor
        </CardTitle>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ej: Cliente prefiere pago con Yape. Pide factura."
          rows={3}
          className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 bg-[var(--surface-alt)] text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between mt-2">
          <AnimatePresence>
            {notesSaved && (
              <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Guardado
              </m.p>
            )}
          </AnimatePresence>
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes || !notes.trim()}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Guardar nota
          </button>
        </div>
      </div>
    </>
  );
}
