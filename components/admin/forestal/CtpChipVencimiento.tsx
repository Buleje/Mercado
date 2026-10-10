"use client";

/**
 * El chip de la guía vencida en la lista de Ingresos y GTF ingresadas
 * (ADR-434 §Vencimiento). En palabras, no sólo con color:
 *
 * - «recibida después del vencimiento (vencía dd/mm)» — rojo: el libro dice
 *   que la madera viajó con la guía vencida. En Blas, 7 de 8 guías de 10-HUA
 *   figuraban así (recibidas el 23/09, vencidas entre el 10 y el 15/09).
 * - «vencida el dd/mm, sin recibir» — ámbar: al recibirla, la fecha tiene que
 *   caer dentro de su vigencia, o confirmarse con motivo.
 *
 * Sin vencimiento en el papel (alta a mano sin ficha), no dice nada: nunca se
 * estima una fecha que la guía no trae. La regla es `estadoDeVencimiento`.
 */

import { CalendarOff } from "@buleje/design-system/icons";
import { estadoDeVencimiento, type GuiaConVigencia } from "@/lib/forestal/fecha-de-llegada";
import { limaDateKey } from "@/lib/utils";

const TONO = {
  recibida_vencida:
    "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  vencida_sin_recibir:
    "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
} as const;

export default function CtpChipVencimiento({ guia, className = "" }: { guia: GuiaConVigencia; className?: string }) {
  const e = estadoDeVencimiento(guia, limaDateKey());
  if (!e) return null;
  return (
    <span
      title={e.detalle}
      className={`inline-flex items-start gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold leading-tight ${TONO[e.tipo]} ${className}`}
    >
      <CalendarOff className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{e.texto}</span>
    </span>
  );
}
