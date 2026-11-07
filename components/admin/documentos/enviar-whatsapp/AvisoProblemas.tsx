"use client";

import { AlertCircle } from "@buleje/design-system/icons";
import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function AvisoProblemas({ arch }: { arch: EstadoEnviar }) {
  const { via, problemas } = arch;
  return (
    <>
      {/* Lo que no entra como adjunto */}
      {via !== "enlace" && problemas.length > 0 && (
        <div className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-100)] p-3 dark:bg-[var(--data-warning-500)]/12">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertCircle className="h-3.5 w-3.5" /> No se pueden adjuntar
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">
            {problemas.map(({ doc: d, motivo }) => (
              <li key={d.id}>
                {d.name} — {motivo}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
            Para esos, manda un enlace.
          </p>
        </div>
      )}
    </>
  );
}
