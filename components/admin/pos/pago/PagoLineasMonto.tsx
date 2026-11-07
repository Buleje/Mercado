"use client";

import { Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmt, METHODS, type PaymentLineMethod } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/**
 * Las líneas de pago cuando no es efectivo solo: el monto de Yape/Plin/Tarjeta
 * (una línea) o el pago mixto (método + monto por línea, con su tacho). Mismos
 * `updateMethod` / `updateAmount` / `removeLine` de siempre. Sin autoFocus: se
 * monta al cambiar de método y en celular abriría el teclado en cada toque.
 */
export default function PagoLineasMonto({ p }: { p: PagoModal }) {
  const { paymentLines, total, linesTotal, pendiente, updateMethod, updateAmount, removeLine, isSinglePayment } = p;
  return (
    <div className="space-y-2">
      {paymentLines.map((line, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {!isSinglePayment && (
            <select
              value={line.method}
              onChange={(e) => updateMethod(idx, e.target.value as PaymentLineMethod)}
              aria-label={`Método de pago, línea ${idx + 1}`}
              className="h-12 w-32 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary"
            >
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          <label className="relative block min-w-0 flex-1">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--text-tertiary)]">
              S/
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.10"
              value={line.amount || ""}
              onChange={(e) => updateAmount(idx, Number(e.target.value) || 0)}
              placeholder={total.toFixed(2)}
              aria-label={`Monto, línea ${idx + 1}`}
              data-pago-enter=""
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-lg font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-primary"
            />
          </label>
          {paymentLines.length > 1 && (
            <button
              type="button"
              aria-label={`Quitar la línea ${idx + 1}`}
              onClick={() => removeLine(idx)}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-ink)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {!isSinglePayment && (
        <p className="text-right text-sm">
          <span className={cn("font-bold tabular-nums", pendiente <= 0.01 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
            {fmt(linesTotal)}
          </span>
          <span className="tabular-nums text-[var(--text-tertiary)]"> / {fmt(total)}</span>
        </p>
      )}
    </div>
  );
}
