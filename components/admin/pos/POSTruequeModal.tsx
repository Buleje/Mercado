"use client";

import { useState } from "react";
import { RefreshCcw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { cn } from "@/lib/utils";
import type { PaymentLine, ComprobanteTipo } from "@/components/admin/pos/POSPaymentModal";
import { Field } from "@/components/admin/shared/Field";
import { formatCurrency } from "@/lib/format";
import type { ExtraCobro } from "@/components/admin/pos/pos-shared";

interface POSTruequeModalProps {
  showTrueque: boolean;
  setShowTrueque: (v: boolean) => void;
  cartTotal: number;
  processing: boolean;
  customerPhone: string;
  handlePaymentConfirm: (payments: PaymentLine[], phone?: string, extra?: ExtraCobro) => Promise<void>;
}

/** Trueque: el cliente paga con productos (y la diferencia en efectivo). */
export default function POSTruequeModal({ showTrueque, setShowTrueque, cartTotal, processing, customerPhone, handlePaymentConfirm }: POSTruequeModalProps) {
  const [truequeDesc, setTruequeDesc] = useState("");
  const [truequeValor, setTruequeValor] = useState("");

  return (
      <AdminModal open={showTrueque} onClose={() => setShowTrueque(false)} title="Trueque Digital" icon={RefreshCcw} variant="centered-sm">
          <div className={MODAL_BODY}>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3">El cliente intercambia productos por su compra (comun en zonas rurales de selva).</p>
            <div className="space-y-3">
              <Field label="Que recibe a cambio?" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1">
                <textarea
                  value={truequeDesc}
                  onChange={e => setTruequeDesc(e.target.value)}
                  placeholder="Ej: 5 kg de platano, 2 gallinas..."
                  rows={2}
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 bg-[var(--surface-sunken)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </Field>
              <Field label="Valor estimado (S/)" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={truequeValor}
                  onChange={e => setTruequeValor(e.target.value)}
                  placeholder="0.00"
                  className="w-32 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 h-10 bg-[var(--surface-sunken)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </Field>
              {Number(truequeValor) > 0 && cartTotal > 0 && (
                <div className={cn("rounded-lg p-3 text-sm font-bold", Number(truequeValor) >= cartTotal ? "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-warning-50)] dark:bg-amber-950/20 text-[var(--data-warning-500)]")}>
                  {Number(truequeValor) >= cartTotal ? (
                    <span>Sin pago adicional (valor trueque cubre el total)</span>
                  ) : (
                    <span>Diferencia a pagar: {formatCurrency(cartTotal - Number(truequeValor))}</span>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  disabled={!truequeDesc.trim() || !truequeValor || Number(truequeValor) <= 0 || processing}
                  onClick={async () => {
                    const valorTrueque = Number(truequeValor);
                    const diferencia = Math.max(0, cartTotal - valorTrueque);
                    const _truequeDetails = JSON.stringify({ tipo: "TRUEQUE", descripcion: truequeDesc, valorEstimado: valorTrueque, diferenciaPagada: diferencia });
                    // Fire sale through normal flow with TRUEQUE payment
                    await handlePaymentConfirm(
                      [{ method: (diferencia > 0 ? "efectivo" : "efectivo") as "efectivo", amount: diferencia > 0 ? diferencia : cartTotal }],
                      customerPhone || undefined,
                      { comprobanteTipo: "ticket" as ComprobanteTipo, customerName: `TRUEQUE: ${truequeDesc} (S/${valorTrueque})`, discountAmount: 0, discountPercent: 0 }
                    );
                    setShowTrueque(false);
                    setTruequeDesc("");
                    setTruequeValor("");
                  }}
                  className="flex-1 min-h-11 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Confirmar trueque
                </button>
                <button onClick={() => setShowTrueque(false)} className="px-4 min-h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
      </AdminModal>
  );
}
