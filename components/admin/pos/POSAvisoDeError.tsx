"use client";

import { Info, X } from "@buleje/design-system/icons";

/** Aviso del error de la última venta en Vender: el mensaje y «Quitar el aviso». */
export default function POSAvisoDeError({ mensaje, onQuitar }: { mensaje: string; onQuitar: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 pl-3 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30">
      <Info className="h-4 w-4 text-[var(--data-error-ink)] shrink-0" aria-hidden />
      <p className="text-sm text-[var(--data-error-ink)] flex-1">{mensaje}</p>
      <button type="button" aria-label="Quitar el aviso" onClick={onQuitar} className="h-12 w-12 shrink-0 inline-flex items-center justify-center text-[var(--data-error-ink)]"><X className="h-4 w-4" /></button>
    </div>
  );
}
