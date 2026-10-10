"use client";

import { ArrowRight, FileWarning } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { textoAvisoPapeles } from "@/lib/forestal/aviso-guias-th";
import { PAPELES_DE_LEY } from "@/lib/forestal/documentos-guia";
import { usePapelesPendientes } from "./use-papeles-pendientes";

/**
 * «N guías sin sus papeles de ley» (ADR-482): factura, guía de remisión, GTF y
 * lista de trozas. Lleva a la lista de guías de Ingresos, donde la columna
 * «Papeles» dice cuál falta en cada una. Sin guías pendientes, o sin permiso
 * para ver los papeles, no se pinta.
 *
 * Una línea + ⓘ (ley de la vista, regla 9): el detalle de cuántas y cuáles
 * papeles va en el ⓘ, a la vista sólo el aviso y la acción.
 */
export function ForestalAvisoPapeles({ activo, onIr }: { activo: boolean; onIr: () => void }) {
  const p = usePapelesPendientes(activo);
  if (!p || p.sinPapeles === 0) return null;
  return (
    <div className="flex w-full items-center gap-3 border border-[var(--data-warning-500)] bg-[var(--surface-raised)] py-1 pl-4 pr-2">
      <FileWarning className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 text-sm font-bold text-[var(--text-primary)]">{textoAvisoPapeles(p.sinPapeles)}</span>
        <InfoTip
          title="Papeles de ley de cada guía"
          what={`De ${p.total} ${p.total === 1 ? "guía" : "guías"} de ingreso, ${p.sinPapeles} no ${p.sinPapeles === 1 ? "tiene" : "tienen"} completos sus ${PAPELES_DE_LEY.length} papeles${p.sinNinguno > 0 ? ` y ${p.sinNinguno} no ${p.sinNinguno === 1 ? "tiene" : "tienen"} ninguno` : ""}.`}
          affects="Cada guía pide la factura, la guía de remisión, la GTF y la lista de trozas. En Ingresos, la columna «Papeles» dice cuál falta en cada una."
          className="shrink-0"
          ariaLabel="Qué papeles faltan"
        />
      </span>
      <button
        type="button"
        onClick={onIr}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
      >
        Ver guías <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
