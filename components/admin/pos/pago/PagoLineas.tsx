"use client";

import { Plus, Trash2, Users, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import POSSplitPayment from "@/components/admin/pos/POSSplitPayment";
import { fmt, METHODS, type PaymentLineMethod } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";
import PagoBilletera from "@/components/admin/pos/pago/PagoBilletera";

/** Texto del aviso de Fiado: quién, cuánto debe ya y en cuánto quedaría (preview; el backend registra). */
function avisoFiado({ customerPhone, customerName, total, deuda }: Pick<PagoModal, "customerPhone" | "customerName" | "total" | "deuda">): string {
  if (!customerPhone) return "La venta queda como deuda. Elige al cliente en la tarjeta Cliente.";
  const quien = customerName || customerPhone;
  if (deuda.loading) return `Viendo cuánto debe ${quien}…`;
  const debe = deuda.data?.montoPendiente ?? 0;
  if (debe <= 0.009) return `${quien} no debe nada. Esta venta queda como su deuda: ${fmt(total)}.`;
  const vencido = deuda.data?.hasFiadosVencidos ? " (tiene fiado vencido)" : "";
  return `${quien} ya debe ${fmt(debe)}${vencido}. Con esta venta quedaría en ${fmt(debe + total)}.`;
}

/** Método de pago, líneas, montos rápidos, billetes y pago mixto. */
export default function PagoLineas({ p }: { p: PagoModal }) {
  const { paymentLines, showSplit, setShowSplit, billetes, total, linesTotal, pendiente, addLine, removeLine, updateMethod, updateAmount, elegirMetodo, deuda, customerPhone, customerName, handleSplitConfirm, totalBilletes, addBillete, limpiarBilletes, quickAmounts, isSinglePayment, isFiado } = p;
  return (
    <>
          {/* Payment lines */}
          <div>
            <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">
              {isSinglePayment ? "Método de pago" : "Pago mixto"}
            </p>

            {/* Fiado warning banner */}
            {isFiado && (
              <div className="mb-4 p-4 rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">Modo Fiado</p>
                  <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1" data-pos-fiado-aviso>
                    {avisoFiado({ customerPhone, customerName, total, deuda })}
                  </p>
                </div>
              </div>
            )}

            {/* Split payment mode */}
            {showSplit ? (
              <POSSplitPayment
                total={total}
                onSplitPayments={handleSplitConfirm}
                onCancel={() => setShowSplit(false)}
              />
            ) : (
              <>
                {/* Single payment - method selector grid (v3 visual) */}
                {isSinglePayment && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                    {METHODS.map((m) => {
                      const selected = paymentLines[0].method === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => elegirMetodo(m.id)}
                          aria-pressed={selected}
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 text-xs font-extrabold transition-all overflow-hidden",
                            selected
                              ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shadow-md"
                              : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:border-primary/40 hover:bg-[var(--surface-raised)] hover:-translate-y-0.5"
                          )}
                        >
                          <span className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                            selected
                              ? "bg-primary text-white"
                              : "bg-[var(--surface-raised)] text-[var(--text-secondary)] group-hover:bg-primary/10 group-hover:text-[var(--accent-ink)] dark:text-[var(--accent)]",
                          )}>
                            <m.icon className="h-4 w-4" />
                          </span>
                          <span className="uppercase tracking-wide">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <PagoBilletera p={p} />

                {/* Payment lines list */}
                <div className="space-y-2">
                  {paymentLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)]"
                    >
                      {!isSinglePayment && (
                        <select
                          value={line.method}
                          onChange={(e) =>
                            updateMethod(
                              idx,
                              e.target.value as PaymentLineMethod
                            )
                          }
                          aria-label={`Método de pago, línea ${idx + 1}`}
                          className="flex-1 min-w-24 px-2 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-semibold bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none"
                        >
                          {METHODS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="relative flex-1 min-w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold">
                          S/
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.10"
                          value={isFiado ? "0.00" : (line.amount || "")}
                          onChange={(e) =>
                            !isFiado && updateAmount(idx, Number(e.target.value) || 0)
                          }
                          readOnly={isFiado}
                          placeholder={total.toFixed(2)}
                          aria-label={`Monto, línea ${idx + 1}`}
                          className={cn(
                            "w-full pl-7 pr-2 h-10 rounded-xl border text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary",
                            isFiado
                              ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/20 text-[var(--data-warning-500)] cursor-not-allowed"
                              : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                          )}
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- la primera línea de pago recibe el foco al abrir el modal
                          autoFocus={idx === 0 && !isFiado}
                        />
                      </div>
                      {paymentLines.length > 1 && (
                        <button aria-label="Eliminar"
                          onClick={() => removeLine(idx)}
                          className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Quick amounts for single efectivo */}
                {isSinglePayment &&
                  paymentLines[0].method === "efectivo" && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {quickAmounts
                        .filter((a) => a >= total)
                        .slice(0, 4)
                        .map((a) => (
                          <button
                            key={a}
                            onClick={() => updateAmount(0, a)}
                            className={cn(
                              "px-4 min-h-10 rounded-xl text-sm font-semibold border transition-colors",
                              paymentLines[0].amount === a
                                ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] "
                            )}
                          >
                            S/{a}
                          </button>
                        ))}
                      <button
                        onClick={() => updateAmount(0, total)}
                        className={cn(
                          "px-4 min-h-10 rounded-xl text-sm font-semibold border transition-colors",
                          paymentLines[0].amount === total
                            ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                            : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] "
                        )}
                      >
                        Exacto
                      </button>
                    </div>
                  )}

                {/* Contador de billetes */}
                {isSinglePayment && paymentLines[0].method === "efectivo" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[var(--text-tertiary)]">Billetes recibidos</span>
                      {billetes.length > 0 && (
                        <button onClick={limpiarBilletes} className="text-sm font-semibold text-[var(--data-error-500)] hover:underline">Limpiar</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[200, 100, 50, 20, 10].map(b => (
                        <button key={b} onClick={() => addBillete(b)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--data-success-500)]/10 dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-sm font-semibold cursor-pointer hover:bg-[var(--data-success-500)]/20 dark:hover:bg-[var(--data-success-500)]/25 transition-colors border border-[var(--data-success-500)]/20">
                          S/{b}
                        </button>
                      ))}
                    </div>
                    {billetes.length > 0 && (
                      <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">
                        {billetes.map(b => `S/${b}`).join(" + ")} = <span className="font-bold text-[var(--text-secondary)]">S/{totalBilletes}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Fiado info */}
                {isFiado && (
                  <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-3 text-center">
                    Deuda: {fmt(total)} — se registrará a nombre del cliente
                  </p>
                )}

                {/* Add method + Split + totals */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-4">
                    {!isFiado && (
                      <>
                        <button
                          onClick={addLine}
                          className="text-sm font-semibold text-primary hover:underline flex items-center gap-1.5"
                        >
                          <Plus className="h-4 w-4" /> Agregar método
                        </button>
                        <button
                          onClick={() => setShowSplit(true)}
                          className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:text-primary flex items-center gap-1.5 transition-colors"
                        >
                          <Users className="h-4 w-4" /> Dividir cuenta
                        </button>
                      </>
                    )}
                  </div>
                  {paymentLines.length > 1 && (
                    <div className="text-sm">
                      <span
                        className={cn(
                          "font-bold",
                          pendiente <= 0.01
                            ? "text-[var(--data-success-500)]"
                            : "text-[var(--data-error-500)]"
                        )}
                      >
                        {fmt(linesTotal)}
                      </span>
                      <span className="text-[var(--text-tertiary)]">
                        {" "}
                        / {fmt(total)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
    </>
  );
}
