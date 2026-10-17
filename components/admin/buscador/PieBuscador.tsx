/**
 * Pie del buscador del panel: los atajos de teclado. Salió de
 * `GlobalSearch.tsx` (17-10) para dejarlo en menos de 300 líneas.
 */

import { AtajoMod } from "@/components/admin/shared/AtajoMod";

export function PieBuscador() {
  return (
    <div className="px-5 py-2.5 bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] dark:text-muted">
        <span className="flex items-center gap-1.5">
          <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold">↑↓</kbd>
          navegar
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold">↵</kbd>
          abrir
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold">Esc</kbd>
          cerrar
        </span>
      </div>
      <span className="hidden sm:flex items-center gap-1 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] dark:text-muted">
        <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold"><AtajoMod tecla="K" /></kbd>
        <span>abrir/cerrar</span>
      </span>
    </div>
  );
}
