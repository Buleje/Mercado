"use client";

/**
 * Cabecera del repaso de vencimientos dentro de «Ordenar» (31-10): cuántos
 * quedan, cuántas fechas van anotadas y la salida. La acción de anotar vive en
 * `OrdenarEnPanel`; acá sólo se ve dónde vas.
 */

import { CalendarClock, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { ModeloArchivo } from "../archivo/use-archivo";

const SALIR = button({ variant: "ghost", className: "shrink-0 gap-1 px-2" });

export const fechasAnotadas = (n: number) => (n === 1 ? "1 fecha anotada" : `${n} fechas anotadas`);

export default function CabeceraRepaso({ arch }: { arch: ModeloArchivo }) {
  const { panelPrevia: p, repasoHechas, setRepasoVence } = arch;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--data-warning-100)] px-2 py-1.5 text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15">
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-bold">
        Repaso de vencimientos{p.posicion && <span data-qa="repaso-posicion"> · {p.posicion.actual} de {p.posicion.total}</span>}
        <span className="block text-xs font-normal">{fechasAnotadas(repasoHechas)}</span>
      </p>
      <button type="button" onClick={() => setRepasoVence(false)} className={SALIR} title="Salir del repaso">
        <X className="h-4 w-4" /> Salir
      </button>
    </div>
  );
}
