"use client";

/**
 * La barra de los árboles elegidos en «Por árbol»: pasaporte, CSV y limpiar.
 * Salió tal cual de `LothTraceView` (08-10) para que la vista no pase de 300
 * líneas al sumar la tabla con columnas.
 */

import { Printer, X } from "@buleje/design-system/icons";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";

const BOTON =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40";

/** Aparece sólo con algo elegido; queda pegada arriba mientras se recorre la lista. */
export default function LothTraceSeleccion({
  seleccionadas,
  onPasaportes,
  onCsv,
  onLimpiar,
}: {
  seleccionadas: TraceFila[];
  onPasaportes: () => void;
  onCsv: () => void;
  onLimpiar: () => void;
}) {
  const conOperacion = seleccionadas.filter((f) => f.op != null).length;
  const n = seleccionadas.length;
  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-info-500)] bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-lg)]">
      <span className="text-sm font-bold text-[var(--text-primary)]">
        {n} árbol{n === 1 ? "" : "es"} seleccionado{n === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={onPasaportes}
        disabled={conOperacion === 0}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        <Printer className="h-4 w-4" aria-hidden="true" /> Pasaporte de {conOperacion === 1 ? "1 árbol" : `los ${conOperacion}`}
      </button>
      <button type="button" onClick={onCsv} className={BOTON}>
        CSV de la selección
      </button>
      <button
        type="button"
        onClick={onLimpiar}
        className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
      >
        <X className="h-4 w-4" aria-hidden="true" /> Limpiar
      </button>
    </div>
  );
}
