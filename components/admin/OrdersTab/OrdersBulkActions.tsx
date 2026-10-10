"use client";

/**
 * Lo que se hace con los pedidos elegidos en la Lista: pasarlos de estado de
 * una vez o imprimirlos. Va en la fila de la barra de filtros, a la derecha
 * (10-10). Antes flotaba fija abajo y salía del Tablero, con texto de 12 px
 * y botones de 32 px; elegir varios es ahora tarea de la Lista.
 *
 * Sin nada elegido queda sólo «Imprimir la lista» (lo que se ve, con sus
 * filtros): antes vivía en el «⋯» de la cabecera, que no tenía otra cosa.
 */
import { Printer, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { OrderStatus } from "@/lib/jsondb";
import { STATUS_LABELS } from "./types";

/** A dónde puede ir un pedido en marcha (a «Pendiente» no se vuelve). El servidor valida cada salto. */
const DESTINOS: readonly OrderStatus[] = [
  "confirmado",
  "preparando",
  "en_camino",
  "entregado",
  "cancelado",
];

interface OrdersBulkActionsProps {
  selectedCount: number;
  bulkStatusTarget: OrderStatus | "";
  bulkUpdating: boolean;
  onBulkStatusChange: (status: OrderStatus | "") => void;
  onExecuteBulkStatus: () => void;
  onClearSelection: () => void;
  onShowPrint: () => void;
  /** Imprime la lista que se ve (sin nada elegido). */
  onImprimirLista: () => void;
}

export function OrdersBulkActions({
  selectedCount,
  bulkStatusTarget,
  bulkUpdating,
  onBulkStatusChange,
  onExecuteBulkStatus,
  onClearSelection,
  onShowPrint,
  onImprimirLista,
}: OrdersBulkActionsProps) {
  if (selectedCount === 0) {
    return (
      <button
        type="button"
        onClick={onImprimirLista}
        aria-label="Imprimir la lista"
        title="Imprimir la lista (los pedidos que se ven)"
        className={button({ variant: "secondary", className: "ml-auto w-12 rounded-xl px-0" })}
      >
        <Printer className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Acciones con los pedidos elegidos"
      className="ml-auto flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] py-0 pl-3 dark:bg-[var(--accent)]/10"
    >
      <span
        className="text-sm font-bold tabular-nums text-[var(--text-primary)]"
        aria-live="polite"
      >
        {selectedCount} {selectedCount === 1 ? "elegido" : "elegidos"}
      </span>
      <select
        value={bulkStatusTarget}
        onChange={(e) => onBulkStatusChange(e.target.value as OrderStatus | "")}
        aria-label="Pasar los pedidos elegidos a"
        className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)]"
      >
        <option value="">Pasar a…</option>
        {DESTINOS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onExecuteBulkStatus}
        disabled={!bulkStatusTarget || bulkUpdating}
        className={button({ variant: "primary", className: "rounded-xl px-4" })}
      >
        {bulkUpdating ? "Aplicando…" : "Aplicar"}
      </button>
      <button
        type="button"
        onClick={onShowPrint}
        className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-3" })}
      >
        <Printer className="h-4 w-4" aria-hidden />
        Imprimir
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        aria-label="Quitar la selección"
        title="Quitar la selección"
        className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
