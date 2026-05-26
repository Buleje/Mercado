"use client";

import { Printer } from "@buleje/design-system/icons";
import type { OrderStatus } from "@/lib/jsondb";
import { STATUS_LABELS } from "./types";

interface OrdersBulkActionsProps {
  selectedCount: number;
  bulkStatusTarget: OrderStatus | "";
  bulkUpdating: boolean;
  onBulkStatusChange: (status: OrderStatus | "") => void;
  onExecuteBulkStatus: () => void;
  onClearSelection: () => void;
  onShowPrint: () => void;
}

export function OrdersBulkActions({
  selectedCount,
  bulkStatusTarget,
  bulkUpdating,
  onBulkStatusChange,
  onExecuteBulkStatus,
  onClearSelection,
  onShowPrint,
}: OrdersBulkActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[var(--text-primary)] text-[var(--surface-canvas)] rounded-xl px-5 py-3 flex items-center gap-3 shadow-xl animate-[slideUp_0.2s_ease-out]">
      <span className="text-sm font-bold">
        {selectedCount} pedido{selectedCount > 1 ? "s" : ""}
      </span>
      <button
        onClick={onShowPrint}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors"
      >
        <Printer className="h-4 w-4" />
        Imprimir seleccionados
      </button>
      <select
        value={bulkStatusTarget}
        onChange={e => onBulkStatusChange(e.target.value as OrderStatus)}
        className="rounded-lg border-0 bg-white/20 text-white text-xs font-semibold px-2 py-1.5 [&>option]:text-[var(--text-primary)]"
      >
        <option value="">Cambiar estado…</option>
        {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>
      <button
        onClick={onExecuteBulkStatus}
        disabled={!bulkStatusTarget || bulkUpdating}
        className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors disabled:opacity-50"
      >
        {bulkUpdating ? "Aplicando…" : "Aplicar"}
      </button>
      <button
        onClick={onClearSelection}
        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
      >
        Limpiar
      </button>
    </div>
  );
}
