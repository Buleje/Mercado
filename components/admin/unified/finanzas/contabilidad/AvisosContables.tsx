"use client";

/** Los avisos del libro, una línea cada uno (el contrato trae el texto ya escrito para la persona). */
import { AlertTriangle } from "@buleje/design-system/icons";
import type { AvisoContable } from "@/lib/contabilidad/tipos";

export default function AvisosContables({ avisos }: { avisos: AvisoContable[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3" aria-label="Avisos del mes">
      {avisos.map((a) => (
        <li key={a.codigo} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span className="min-w-0 flex-1">{a.texto}</span>
        </li>
      ))}
    </ul>
  );
}
