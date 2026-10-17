"use client";

import { Percent, DollarSign, ChevronDown, ChevronUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/** Descuento plegable (porcentaje o monto) dentro del cobro. */
export default function PagoDescuento({ p }: { p: PagoModal }) {
  const { subtotal, showDiscount, setShowDiscount, discountMode, setDiscountMode, discountValue, setDiscountValue, discountAmount, discountPercent, total, quickDiscountValues, applyQuickDiscount } = p;
  return (
    <>
          {/* Descuento — collapsible */}
          <div>
            <button
              onClick={() => setShowDiscount(!showDiscount)}
              className="flex items-center justify-between w-full text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3"
            >
              <span className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Descuento
                {discountAmount > 0 && (
                  <span className="text-[var(--data-error-500)] font-bold">
                    (-{fmt(discountAmount)})
                  </span>
                )}
              </span>
              {showDiscount ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showDiscount && (
              <div className="space-y-3 bg-[var(--surface-sunken)] rounded-xl p-4 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <div className="flex items-center gap-3">
                  <div className="flex bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setDiscountMode("percent");
                        setDiscountValue("");
                      }}
                      aria-label="Descuento en porcentaje"
                      aria-pressed={discountMode === "percent"}
                      className={cn(
                        "px-3 min-h-10 text-sm font-semibold transition-colors flex items-center gap-1",
                        discountMode === "percent"
                          ? "bg-primary text-white"
                          : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
                      )}
                    >
                      <Percent className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setDiscountMode("fixed");
                        setDiscountValue("");
                      }}
                      aria-label="Descuento en monto fijo"
                      aria-pressed={discountMode === "fixed"}
                      className={cn(
                        "px-3 min-h-10 text-sm font-semibold transition-colors flex items-center gap-1",
                        discountMode === "fixed"
                          ? "bg-primary text-white"
                          : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
                      )}
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={discountMode === "percent" ? 100 : subtotal}
                    step={discountMode === "percent" ? 1 : 0.5}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0"
                    className="w-24 px-3 h-10 text-sm font-semibold border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary text-center"
                  />
                  {discountAmount > 0 && (
                    <button
                      onClick={() => {
                        setDiscountValue("");
                        setShowDiscount(false);
                      }}
                      className="text-sm font-semibold text-[var(--data-error-500)] hover:underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {quickDiscountValues.map((q) => (
                    <button
                      key={q}
                      onClick={() => applyQuickDiscount(q)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                        Number(discountValue) === q
                          ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)]"
                      )}
                    >
                      {discountMode === "percent" ? `${q}%` : `S/${q}`}
                    </button>
                  ))}
                </div>

                {discountAmount > 0 && (
                  <div className="text-sm space-y-1.5 pt-2">
                    <div className="flex justify-between text-[var(--text-tertiary)] dark:text-muted">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--data-error-500)] font-semibold">
                      <span>Descuento {discountMode === "percent" ? `${discountPercent.toFixed(0)}%` : ""}</span>
                      <span className="tabular-nums">-{fmt(discountAmount)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-primary)] dark:text-[var(--text-primary)] font-extrabold border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] pt-2 text-base">
                      <span>Total</span>
                      <span className="tabular-nums">{fmt(total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
    </>
  );
}
