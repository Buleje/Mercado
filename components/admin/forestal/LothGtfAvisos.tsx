/**
 * Los avisos de la vista GTF del Libro TH. Salieron de `LothGtfView` (08-10,
 * la vista pasaba de 300 líneas) sin cambiar el DOM.
 */

import { AlertTriangle, Plus } from "@buleje/design-system/icons";

/**
 * Las guías que el libro declara y nadie emitió. Acá sí sirve: quien puede
 * emitirlas está en esta pantalla.
 */
export function AvisoGuiasSinEmitir({ numeros, onEmitir }: { numeros: readonly string[]; onEmitir: () => void }) {
  if (numeros.length === 0) return null;
  return (
    <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        <AlertTriangle className="h-4 w-4" />
        {numeros.length === 1
          ? "1 guía está declarada en el libro y no figura acá"
          : `${numeros.length} guías están declaradas en el libro y no figuran acá`}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        El libro ampara salidas con {numeros.length === 1 ? "este número" : "estos números"}: o la guía se emitió fuera
        del sistema, o el número del libro tiene un error de tipeo. Ante una fiscalización, esa madera viaja sin documento que la
        respalde.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {numeros.map((g) => (
          <span
            key={g}
            className="rounded-full border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-2.5 py-0.5 font-mono text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          >
            {g}
          </span>
        ))}
        <button
          type="button"
          onClick={onEmitir}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Emitir la guía faltante
        </button>
      </div>
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
