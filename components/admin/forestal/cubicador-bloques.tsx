"use client";

/**
 * Piezas de los bloques del cubicador de madera (Brandon 23-10): la tira que
 * queda del panel de dictado plegado y la sección «Grabaciones».
 *
 * Plegar no es esconder: la tira dice el nombre del bloque y lo trae de vuelta
 * con un toque; si desapareciera del todo, la función se perdería. Con las
 * secciones (una a la vez, `cubicador-secciones`) sólo se pliega dentro de
 * «Producir sin lote», donde todo va apilado.
 */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, Mic } from "@buleje/design-system/icons";
import { GrabadoraVoz } from "@/components/admin/forestal/grabadora/GrabadoraVoz";

/** Lo que queda de un bloque plegado: su nombre y «Mostrar». */
export function TiraPlegada({ icono, children, onMostrar }: {
  icono: ReactNode;
  children: ReactNode;
  onMostrar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onMostrar}
      className="flex w-full items-center justify-between gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5 text-left transition-colors hover:border-[var(--accent)]"
    >
      <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
        {icono} {children}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <ChevronDown className="h-3.5 w-3.5" aria-hidden /> Mostrar
      </span>
    </button>
  );
}

/**
 * Sección «Grabaciones»: las notas habladas del lote. La grabadora la construye
 * su propio carril; acá sólo se monta con el contexto del lote abierto
 * (CONTRATO: `carpeta?`, `contexto?`).
 */
export function BloqueGrabaciones({ id, contexto }: { id: string; contexto: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <CardTitle as="h3" id={`${id}-titulo`} className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Mic className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Grabaciones de voz
      </CardTitle>
      <GrabadoraVoz contexto={contexto} />
    </section>
  );
}
