"use client";

/**
 * CashChangeModal — modal que pregunta al cliente con cuanto efectivo va a
 * pagar para calcular el vuelto antes de confirmar el pedido.
 *
 * Brandon, mayo 14 2026: la calculadora vivia inline dentro del SectionBox
 * de "Método de pago" y agregaba scroll innecesario. Ahora se abre como
 * modal cuando el cliente toca "Efectivo" (o el chip "Configurar vuelto"
 * dentro del payment card). Cierra al confirmar — el monto/vuelto queda
 * persistido en el checkoutData.
 *
 * Estados:
 *   - choice="exact":  paga el monto exacto, sin vuelto.
 *   - choice="custom": el cliente ingresa cuanto va a entregar y se calcula
 *                     el vuelto (puede usar quick chips 10/20/50/100/200).
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import {
  X,
  Wallet,
  Check,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

export interface CashChangeModalProps {
  open: boolean;
  onClose: () => void;
  /** Monto total del pedido — base para calcular el vuelto. */
  total: number;
  /** Valor inicial (para reabrir con el monto previamente seleccionado). */
  initialAmount?: string;
  /** Cuando el cliente confirma, recibimos el monto como string (formato
   *  que usa el checkout state). Vacio = exacto sin vuelto. */
  onConfirm: (amount: string) => void;
}

export default function CashChangeModal({
  open,
  onClose,
  total,
  initialAmount = "",
  onConfirm,
}: CashChangeModalProps) {
  // El cliente elige "exact" o "custom". Si initialAmount ya es > total,
  // por default arrancamos en "custom" con ese valor.
  const initialIsCustom = Boolean(initialAmount && Number(initialAmount) > total);
  const [choice, setChoice] = useState<"exact" | "custom">(
    initialIsCustom ? "custom" : "exact",
  );
  const [customAmount, setCustomAmount] = useState(initialAmount || "");

  // Resetear al abrir para reflejar el monto actual y total fresh
  useEffect(() => {
    if (open) {
      const isCust = Boolean(initialAmount && Number(initialAmount) > total);
      setChoice(isCust ? "custom" : "exact");
      setCustomAmount(initialAmount || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cashAmount = useMemo(() => {
    if (choice === "exact") return total;
    return Number(customAmount || 0);
  }, [choice, customAmount, total]);

  const cashChange = cashAmount - total;
  const cashShort = choice === "custom" && cashAmount > 0 && cashAmount < total;
  const canConfirm = choice === "exact" || (cashAmount >= total && cashAmount > 0);

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm(choice === "exact" ? "" : String(cashAmount));
    onClose();
  }, [canConfirm, choice, cashAmount, onConfirm, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cash-change-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/65"
          style={{ zIndex: 2147483647 }}
          onClick={onClose}
        >
          <motion.div
            key="cash-change-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Calculadora de vuelto para pago en efectivo"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-md max-h-[92svh] flex flex-col rounded-t-3xl sm:rounded-[28px] bg-[var(--surface-raised)] overflow-hidden"
            style={{ boxShadow: "0 30px 70px -15px rgba(0,0,0,0.45)" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-[var(--rule-soft)] bg-linear-to-b from-[var(--accent-soft)]/40 to-transparent">
              <div className="flex items-start gap-3 min-w-0">
                <span className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)]">
                  <Wallet className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] leading-tight">
                    Pago en efectivo
                  </p>
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                    Calculadora de vuelto
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-sunken)] hover:bg-[var(--rule-base)] text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
              {/* Total prominente */}
              <div className="rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-4 flex items-baseline justify-between gap-3">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Total a pagar
                </span>
                <span className="text-2xl font-black tabular-nums text-[var(--text-primary)]">
                  {fmt(total)}
                </span>
              </div>

              {/* Opciones radio */}
              <div>
                <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
                  ¿Con cuánto vas a pagar?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setChoice("exact")}
                    aria-pressed={choice === "exact"}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-all",
                      choice === "exact"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_4px_16px_-8px_var(--accent)]"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/50",
                    )}
                  >
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Opción 1
                    </span>
                    <span className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                      Monto exacto
                    </span>
                    <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] tabular-nums">
                      {fmt(total)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChoice("custom")}
                    aria-pressed={choice === "custom"}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-all",
                      choice === "custom"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_4px_16px_-8px_var(--accent)]"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/50",
                    )}
                  >
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Opción 2
                    </span>
                    <span className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                      Voy a dar más
                    </span>
                    <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                      Te damos vuelto
                    </span>
                  </button>
                </div>
              </div>

              {/* Custom amount + quick chips + vuelto */}
              {choice === "custom" && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="cash-input"
                      className="block text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2"
                    >
                      ¿Cuánto vas a entregar?
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] h-12 px-4 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)]">
                        S/
                      </span>
                      <input
                        id="cash-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.10"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder={total.toFixed(2)}
                        className={cn(
                          "flex-1 h-12 rounded-full border bg-[var(--surface-raised)] px-4 text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--text-tertiary)]",
                          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]",
                          cashShort
                            ? "border-[var(--data-error-500)] focus:ring-[var(--data-error-500)]/30"
                            : "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent-soft)]",
                        )}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.filter((v) => v >= total).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setCustomAmount(String(v))}
                        className={cn(
                          "rounded-full border h-10 px-4 text-[length:var(--ts-xs)] font-bold transition-colors tabular-nums",
                          Number(customAmount) === v
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40",
                        )}
                      >
                        S/{v}
                      </button>
                    ))}
                  </div>

                  {/* Feedback de vuelto */}
                  {cashAmount > 0 && cashAmount >= total && (
                    <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                        Tu vuelto
                      </span>
                      <span className="text-xl font-black tabular-nums text-[var(--accent)]">
                        {fmt(cashChange)}
                      </span>
                    </div>
                  )}

                  {cashShort && (
                    <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50,#fef2f2)] p-3 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 mt-0.5 text-[var(--data-error-500)] shrink-0" strokeWidth={2.25} aria-hidden />
                      <p className="text-[length:var(--ts-xs)] font-bold text-[var(--data-error-700,#b91c1c)] leading-tight">
                        Faltan {fmt(total - cashAmount)} para cubrir el total.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 sm:px-6 py-4 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)] transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={cn(
                  "flex-1 h-12 rounded-2xl text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
                  "bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] hover:brightness-110 shadow-[0_8px_20px_-8px_var(--accent)]",
                )}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
                Confirmar pago
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
