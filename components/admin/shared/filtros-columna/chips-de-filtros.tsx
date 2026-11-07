"use client";

/**
 * ChipsDeFiltros — lo que está acotando la tabla ahora mismo, con su cruz.
 *
 * Existe por el «filtro huérfano» (memoria `filtros-en-la-cabecera-tipo-excel`):
 * una columna se puede apagar desde «Columnas» con su filtro puesto, y sin un
 * control fuera de la cabecera la tabla quedaría acotada sin forma de
 * desacotarla. Los chips viven SIEMPRE arriba de la tabla — filtro en cabecera
 * visible u oculta, da igual.
 */

import { X } from "@buleje/design-system/icons";
import type { ChipFiltro } from "@/lib/admin/filtros-columna";

export interface ChipsDeFiltrosProps {
  chips: readonly ChipFiltro[];
  onQuitar: (id: string) => void;
  onLimpiarTodo?: () => void;
  className?: string;
}

export function ChipsDeFiltros({ chips, onQuitar, onLimpiarTodo, className = "" }: ChipsDeFiltrosProps) {
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="list" aria-label="Filtros puestos">
      {chips.map((c) => (
        // El `role="listitem"` va en el envoltorio: ponerlo directo en el
        // `<button>` PISA su rol nativo de "button" (un `role` explícito
        // siempre gana sobre el implícito) y ningún lector de pantalla ni
        // `getByRole("button", …)` lo vuelve a encontrar como botón.
        <div key={c.id} role="listitem">
          <button
            type="button"
            onClick={() => onQuitar(c.id)}
            aria-label={`Quitar el filtro de ${c.label}: ${c.texto}`}
            title={`Quitar el filtro de ${c.label}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-[var(--accent)] bg-primary/10 pl-3 pr-2 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-primary/15 dark:text-[var(--accent)]"
          >
            <span className="truncate">{c.texto}</span>
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </div>
      ))}
      {chips.length > 1 && onLimpiarTodo && (
        <button
          type="button"
          onClick={onLimpiarTodo}
          className="text-sm font-bold text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
