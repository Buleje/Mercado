"use client";

/**
 * Anexo04Checklist — qué le falta al anexo antes de emitirlo. Los ERRORES son
 * lo que hace que la ARFFS devuelva el papel; los AVISOS, lo que un fiscalizador
 * va a preguntar. Nunca bloquea la descarga: imprimir la hoja en blanco para
 * llenarla a mano es un uso legítimo del formato oficial.
 */
import { AlertTriangle, Check } from "@buleje/design-system/icons";
import type { AvisoAnexo04 } from "@/lib/forestal/anexo04-validacion";

export default function Anexo04Checklist({ avisos, presentable }: { avisos: AvisoAnexo04[]; presentable: boolean }) {
  if (avisos.length === 0) {
    return (
      <p className="mb-2 flex items-center gap-2 rounded-lg border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-3 py-2 text-xs font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
        <Check className="h-4 w-4 shrink-0" /> Listo para presentar: el anexo tiene todo lo que pide el formato.
      </p>
    );
  }
  return (
    <ul className={`mb-2 space-y-1 rounded-lg border-2 px-3 py-2 ${presentable
      ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12"
      : "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12"}`}>
      {avisos.map((a) => (
        <li key={a.mensaje} className={`flex items-start gap-2 text-xs font-bold ${a.nivel === "error"
          ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.mensaje}
        </li>
      ))}
    </ul>
  );
}
