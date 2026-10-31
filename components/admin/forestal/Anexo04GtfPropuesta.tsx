"use client";

/**
 * El siguiente N° del talonario para la «GTF N°» del Anexo 04 (Fase 5).
 *
 * Es el MISMO que propone «Emitir GTF» en Despacho (`useProximaGtf`: el máximo
 * de despachos, anulados y anexos de la serie + 1, con los dígitos de la
 * Ficha), sólo lectura. Se monta únicamente con la casilla vacía: un número
 * ya escrito no se pisa, y así no se pide nada cuando no hace falta. El (1) N°
 * del anexo es otro número —el del formulario SERFOR, `2-19-0461363`— y no
 * sale de este talonario.
 */
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useProximaGtf } from "@/hooks/use-proxima-gtf";

export default function Anexo04GtfPropuesta({ onUsar }: { onUsar: (gtf: string) => void }) {
  const { propuesta } = useProximaGtf();
  if (!propuesta) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onUsar(propuesta.gtf)}
        title="Poner el siguiente número del talonario de la Ficha; lo puedes cambiar"
        className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-[var(--accent)]/50 bg-primary/10 px-2 py-1 text-left text-xs font-bold text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] dark:text-[var(--accent)]"
      >
        <span className="min-w-0 leading-tight">
          Usar el siguiente
          <span className="block whitespace-nowrap font-mono tabular-nums">{propuesta.gtf}</span>
        </span>
      </button>
      <InfoTip
        icono="ayuda"
        title="Siguiente del talonario"
        what="Es el número que sigue en la serie de la Ficha, mirando los despachos, los anulados y los anexos ya guardados."
        example="Si el último fue 19-001-0000064, propone 19-001-0000065."
      />
    </div>
  );
}
