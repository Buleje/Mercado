"use client";

import { CardTitle } from "@buleje/design-system";
import { X, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { POSCarrito } from "@/components/admin/pos/usePOSCarrito";

type POSStockAlertsProps = Pick<POSCarrito, "stockAlert" | "setStockAlert" | "showZeroStockConfirm" | "setShowZeroStockConfirm" | "forceAddZeroStock">;

/** Aviso flotante de stock bajo / por vencer y la confirmación de vender sin stock. */
export default function POSStockAlerts({ stockAlert, setStockAlert, showZeroStockConfirm, setShowZeroStockConfirm, forceAddZeroStock }: POSStockAlertsProps) {
  return (
    <>
      {stockAlert && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-modal animate-in slide-in-from-bottom-4 fade-in duration-[var(--dur-base)]">
          <div className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2",
            stockAlert.type === "warning"
              ? "bg-[var(--data-warning-500)] text-white"
              : "bg-[var(--data-error-500)] text-white"
          )}>
            {stockAlert.message}
            {stockAlert.actionLabel && stockAlert.actionFn && (
              <button onClick={stockAlert.actionFn} className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-[length:var(--ts-2xs)] font-bold whitespace-nowrap">
                {stockAlert.actionLabel}
              </button>
            )}
            <button aria-label="Quitar" onClick={() => setStockAlert(null)} className="p-0.5 hover:bg-white/20 rounded">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Mejora 7: Zero Stock Confirmation ────────────────────────────────── */}
      {showZeroStockConfirm && (
        <div className="modal-backdrop p-4">
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-xs w-full p-4 sm:p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-[var(--data-error-50)] flex items-center justify-center mx-auto mb-3">
              <Package className="h-5 w-5 text-[var(--data-error-500)]" />
            </div>
            <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-1">Sin stock</CardTitle>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-4">
              <span className="font-semibold">{showZeroStockConfirm.name}</span> no tiene stock disponible. Agregar de todos modos?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowZeroStockConfirm(null)}
                className="flex-1 py-2 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => forceAddZeroStock(showZeroStockConfirm)}
                className="flex-1 py-2 rounded-xl bg-[var(--data-warning-500)] text-white text-xs font-bold hover:bg-[var(--data-warning-500)] transition-colors"
              >
                Agregar igual
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
