"use client";

import { Receipt, Loader2, HandCoins } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/** Pie del cobro: Confirmar venta / Registrar fiado. */
export default function PagoPie({ p }: { p: PagoModal }) {
  const { processing, customerPhone, total, handleConfirm, isFiado, canConfirm } = p;
  return (
        <div className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.06)]">
          {isFiado && !customerPhone && (
            <p className="text-sm text-[var(--data-error-500)] font-semibold text-center mb-3">
              Selecciona un cliente para continuar
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "group relative w-full py-4 rounded-2xl font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between px-6 text-white overflow-hidden",
              isFiado
                ? "bg-[var(--data-warning-500)] hover:brightness-110 shadow-lg"
                : "bg-linear-to-r from-primary to-[var(--color-primary-dark)] hover:brightness-110 shadow-lg"
            )}
          >
            <span className="flex items-center gap-2.5">
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isFiado ? (
                <HandCoins className="h-5 w-5" />
              ) : (
                <Receipt className="h-5 w-5" />
              )}
              <span>
                {processing
                  ? "Procesando..."
                  : isFiado
                  ? "Registrar fiado"
                  : "Confirmar venta"}
              </span>
            </span>
            {!processing && (
              <span className="text-2xl tabular-nums tracking-tight">
                {fmt(total)}
              </span>
            )}
          </button>
        </div>
  );
}
