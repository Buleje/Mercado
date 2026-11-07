/**
 * La línea que dice que el registro del enlace ya no está (lo buscó ⌘K y
 * alguien lo borró, o el enlace es viejo). Lo dibuja la pantalla que usa
 * `useFilaEnUrl` o su ficha por URL; se va sola con el aviso del hook.
 */
import { Info } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

export default function AvisoRegistroAusente({ que, className }: { que: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-start gap-2.5 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3.5 py-3 text-sm text-[var(--text-primary)]", className)}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <p className="min-w-0 flex-1">{que} ya no existe: puede que lo hayan borrado. Búscalo de nuevo con Ctrl+K.</p>
    </div>
  );
}
