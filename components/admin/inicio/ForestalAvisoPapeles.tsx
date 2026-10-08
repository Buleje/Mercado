"use client";

import { ArrowRight, FileWarning } from "@buleje/design-system/icons";
import { textoAvisoPapeles } from "@/lib/forestal/aviso-guias-th";
import { PAPELES_DE_LEY } from "@/lib/forestal/documentos-guia";
import { usePapelesPendientes } from "./use-papeles-pendientes";

/**
 * «N guías sin sus papeles de ley» (ADR-482): factura, guía de remisión, GTF y
 * lista de trozas. Lleva a la lista de guías de Ingresos, donde la columna
 * «Papeles» dice cuál falta en cada una. Sin guías pendientes, o sin permiso
 * para ver los papeles, no se pinta.
 */
export function ForestalAvisoPapeles({ activo, onIr }: { activo: boolean; onIr: () => void }) {
  const p = usePapelesPendientes(activo);
  if (!p || p.sinPapeles === 0) return null;
  return (
    <button
      type="button"
      onClick={onIr}
      className="flex w-full items-center gap-3 border border-[var(--data-warning-500)] bg-[var(--surface-raised)] px-4 py-3 text-left transition hover:bg-[var(--surface-sunken)]"
    >
      <FileWarning className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--text-primary)]">{textoAvisoPapeles(p.sinPapeles)}</span>
        <span className="block text-xs text-[var(--text-secondary)]">
          De {p.total} {p.total === 1 ? "guía" : "guías"} de ingreso
          {p.sinNinguno > 0 ? `, ${p.sinNinguno} sin ninguno de los ${PAPELES_DE_LEY.length}` : ""}. Faltan la factura, la guía de
          remisión, la GTF o la lista de trozas.
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        Ver guías <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </button>
  );
}
