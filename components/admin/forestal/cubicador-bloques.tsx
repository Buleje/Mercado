"use client";

/**
 * Piezas de los bloques del cubicador de madera (Brandon 23-10): la tira que
 * queda de un bloque plegado y el bloque 3, «Grabaciones de voz».
 *
 * Plegar no es esconder: la tira dice el nombre del bloque y lo trae de vuelta
 * con un toque; si desapareciera del todo, la función se perdería.
 */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, ChevronUp, Mic } from "@buleje/design-system/icons";
import { GrabadoraVoz } from "@/components/admin/forestal/grabadora/GrabadoraVoz";
import { NumeroDeBloque } from "./cubicador-indice";

/** Lo que queda de un bloque plegado: su número, su nombre y «Mostrar». */
export function TiraPlegada({ numero, icono, children, onMostrar }: {
  numero?: number;
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
        {numero != null && <NumeroDeBloque n={numero} />}
        {icono} {children}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <ChevronDown className="h-3.5 w-3.5" aria-hidden /> Mostrar
      </span>
    </button>
  );
}

/**
 * Bloque 3: las notas habladas del lote. La grabadora la construye su propio
 * carril; acá sólo se monta con el contexto del lote abierto (CONTRATO:
 * `carpeta?`, `contexto?`).
 */
export function BloqueGrabaciones({ id, className, plegado, onPlegado, contexto }: {
  id: string;
  className?: string;
  plegado: boolean;
  onPlegado: (plegado: boolean) => void;
  contexto: string;
}) {
  const icono = <Mic className="h-4 w-4 text-[var(--accent)]" aria-hidden />;
  return (
    <div id={id} className={className}>
      {plegado ? (
        <TiraPlegada numero={3} icono={icono} onMostrar={() => onPlegado(false)}>
          Grabaciones de voz
        </TiraPlegada>
      ) : (
        <section aria-labelledby={`${id}-titulo`} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <CardTitle as="h3" id={`${id}-titulo`} className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <NumeroDeBloque n={3} />
              {icono} Grabaciones de voz
            </CardTitle>
            <button
              type="button"
              onClick={() => onPlegado(true)}
              title="Ocultar las grabaciones de voz"
              aria-label="Ocultar las grabaciones de voz"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden /> Ocultar
            </button>
          </div>
          <GrabadoraVoz contexto={contexto} />
        </section>
      )}
    </div>
  );
}
