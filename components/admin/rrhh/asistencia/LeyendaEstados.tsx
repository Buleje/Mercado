/**
 * LeyendaEstados — qué significa cada letra (P, T, ½, F, Pe, D, V).
 *
 * La hoja del día no tenía leyenda: «Pe» y «D» sólo se entendían pasando el
 * mouse, y en el celular no hay mouse. La del mes era una línea de 10 px.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA } from "../rrhh-ui";

export default function LeyendaEstados({ extra, className }: { extra?: ReactNode; className?: string }) {
  return (
    <ul aria-label="Qué significa cada letra" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-secondary)]", className)}>
      {ORDEN_ESTADOS_ASISTENCIA.map((estado) => {
        const meta = ESTADO_ASISTENCIA_META[estado];
        return (
          <li key={estado} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("inline-grid h-5 min-w-[1.5rem] place-items-center rounded-md px-1 text-xs font-bold", meta.claseChip)}>
              {meta.letra}
            </span>
            {meta.label}
          </li>
        );
      })}
      {extra}
    </ul>
  );
}
