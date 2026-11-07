/**
 * Los avisos de la vista GTF del Libro TH. Salieron de `LothGtfView` (08-10,
 * la vista pasaba de 300 líneas).
 */

import { AlertTriangle, Plus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/** Cuántos números se ven en la línea; el resto, en el ⓘ. */
const NUMEROS_A_LA_VISTA = 3;

/**
 * Las guías que el libro declara y nadie emitió. Acá sí sirve: quien puede
 * emitirlas está en esta pantalla. Una línea + ⓘ (compactación 17-10: era una
 * caja de 140 px con un párrafo): el porqué y la lista entera van en el ⓘ.
 */
export function AvisoGuiasSinEmitir({ numeros, onEmitir }: { numeros: readonly string[]; onEmitir: () => void }) {
  if (numeros.length === 0) return null;
  const uno = numeros.length === 1;
  const resto = numeros.length - NUMEROS_A_LA_VISTA;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-[1.5px] border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 py-1 pl-3 pr-1"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-hidden />
      <strong className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {uno ? "1 guía del libro sin emitir acá" : `${numeros.length} guías del libro sin emitir acá`}
      </strong>
      <span className="flex flex-wrap items-center gap-1.5">
        {numeros.slice(0, NUMEROS_A_LA_VISTA).map((g) => (
          <span
            key={g}
            className="rounded-full border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-2.5 py-0.5 font-mono text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          >
            {g}
          </span>
        ))}
        {resto > 0 && <span className="font-mono text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">+{resto}</span>}
      </span>
      <InfoTip
        title={uno ? "Una guía declarada en el libro que no figura acá" : "Guías declaradas en el libro que no figuran acá"}
        what={`El libro ampara salidas con ${uno ? "este número" : "estos números"}: o la guía se emitió fuera del sistema, o el número del libro tiene un error de tipeo.`}
        affects="Ante una fiscalización, esa madera viaja sin documento que la respalde."
        example={`${uno ? "El número" : "Los números"}: ${numeros.join(", ")}.`}
      />
      <button
        type="button"
        onClick={onEmitir}
        className="ml-auto inline-flex h-12 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Emitir la guía faltante
      </button>
    </div>
  );
}

/**
 * Se llegó buscando una guía que no está emitida acá. Pasa de verdad: el libro
 * puede declarar un despacho con un N° de GTF que nadie registró en este
 * módulo. Callarlo deja al usuario mirando una lista donde su guía no aparece;
 * decirlo convierte el viaje en un hallazgo de compliance.
 */
export function AvisoFocoAusente({ gtfNumber }: { gtfNumber: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 p-3 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      La guía <b className="font-mono">{gtfNumber}</b> está declarada en el Libro de Operaciones pero no figura entre las guías
      emitidas acá. O se emitió fuera del sistema, o el número del libro tiene un error de tipeo.
    </div>
  );
}
