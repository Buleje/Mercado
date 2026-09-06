"use client";

/** Estilo de input compartido — calca el de FiadoFormModal.tsx para consistencia visual dentro del módulo. */
export const inputCls =
  "w-full h-12 px-4 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";

export function ModalActions({ onClose, onSubmit, saving, label }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2 px-6 py-4">
      <button onClick={onClose} className="h-12 flex-1 rounded-xl text-base font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">Cancelar</button>
      <button onClick={onSubmit} disabled={saving} className="h-12 flex-1 rounded-xl bg-primary text-base font-bold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:shadow-none">{saving ? "Guardando…" : label}</button>
    </div>
  );
}
