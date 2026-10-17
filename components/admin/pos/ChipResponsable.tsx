"use client";

import { cn } from "@/lib/utils";
import type { ResponsableVenta } from "./use-responsable-venta";

/**
 * Chip de la barra de Ventas & Caja: a nombre de quién queda la venta y de
 * quién es el turno abierto (H02/M02). Dos nombres distintos = dos personas,
 * y el `title` dice qué significa cada una antes de vender, no al cobrar.
 */
export function ChipResponsable({ r, onTurnoPropio, onIrATurnos }: { r: ResponsableVenta; onTurnoPropio: () => void; onIrATurnos: () => void }) {
  const yo = r.vendesComo ?? "tú";
  const deOtro = r.turnoAbierto === true && !r.turnoEsMio;
  const estado = r.turnoAbierto ? (r.turnoEsMio ? "tu turno" : `turno de ${r.turnoDe ?? "otra persona"}`) : "sin turno";
  const explica = r.turnoAbierto
    ? r.turnoEsMio
      ? `Vendes como ${yo}, en tu turno: entra en su cuadre y en tu comisión. Clic para cerrarlo.`
      : `El turno abierto es de ${r.turnoDe ?? "otra persona"}. Lo que vendas queda a nombre de ${yo} (tu comisión) y no entra en el cuadre de ese turno. Clic para ver los turnos.`
    : `Lo que vendas queda a nombre de ${yo} (cuenta para tu comisión), pero no entra en el cuadre de ningún turno. Clic para abrir uno.`;

  return (
    <button
      type="button"
      data-qa="chip-responsable"
      onClick={r.turnoAbierto && r.turnoEsMio ? onTurnoPropio : onIrATurnos}
      title={explica}
      aria-label={`Vendes como ${yo}, ${estado}. ${explica}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
        r.turnoAbierto && r.turnoEsMio
          ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] hover:bg-primary/10 dark:text-[var(--data-success-500)]"
          : deOtro
            ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)] hover:bg-[var(--data-warning-500)]/20"
            : "bg-[var(--rule-soft)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", r.turnoAbierto ? (deOtro ? "bg-[var(--data-warning-500)]" : "animate-pulse bg-[var(--data-success-500)]") : "bg-[var(--text-tertiary)]")}
        aria-hidden
      />
      {r.vendesComo && <span className="truncate">{r.vendesComo} ·</span>}
      <span className="truncate">{r.vendesComo ? estado : estado.charAt(0).toUpperCase() + estado.slice(1)}</span>
    </button>
  );
}
