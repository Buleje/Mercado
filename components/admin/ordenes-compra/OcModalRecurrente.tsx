"use client";

import { CardTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { Field } from "@/components/admin/shared/Field";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Ventana «Hacer recurrente». Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcModalRecurrente({ oc }: { oc: OrdenesCompra }) {
  const {
    suppliers, showRecurringModal, recurringInterval, setRecurringInterval, recurringNotifyDays,
    setRecurringNotifyDays, guardandoRecurrente, nextRecurringDateLabel, recurringModalRef,
    recurringTitleId, closeRecurringModal, addRecurringOrder,
  } = oc;
  return (
    <>
      {/* Mejora 15: Modal de configuración recurrente */}
      {showRecurringModal && (
        <div className="modal-backdrop p-4" role="presentation" onClick={(e) => e.target === e.currentTarget && closeRecurringModal()}>
          <div ref={recurringModalRef} role="dialog" aria-modal="true" aria-labelledby={recurringTitleId} tabIndex={-1} className="bg-[var(--surface-raised)] rounded-xl w-full max-w-sm p-6 space-y-4">
            <CardTitle id={recurringTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Hacer recurrente</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
              OC para {suppliers.find(s => s.id === showRecurringModal.supplierId)?.name} · {showRecurringModal.items.length} productos
            </p>
            <div>
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1.5 block">Repetir cada</span>
              <div className="flex gap-2">
                {[7, 15, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setRecurringInterval(d)}
                    className={cn(
                      "flex-1 min-h-10 rounded-xl text-sm font-semibold transition-colors",
                      recurringInterval === d ? "bg-[var(--accent-600,var(--accent))] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                    )}
                  >
                    {d} dias
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">Próximo pedido</span>
              <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {nextRecurringDateLabel}
              </p>
            </div>
            <Field label="Notificarme" labelClassName="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">
              <select
                value={recurringNotifyDays}
                onChange={e => setRecurringNotifyDays(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-3 h-10 text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
              >
                <option value={1}>1 dia antes</option>
                <option value={2}>2 dias antes</option>
                <option value={3}>3 dias antes</option>
                <option value={5}>5 dias antes</option>
              </select>
            </Field>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeRecurringModal}
                className="flex-1 h-12 rounded-xl bg-[var(--surface-sunken)] text-sm font-semibold text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoRecurrente}
                onClick={() => addRecurringOrder(showRecurringModal)}
                className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--accent-600,var(--accent))] text-white text-sm font-semibold hover:bg-[var(--accent)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {guardandoRecurrente && <Loader2 className="h-4 w-4 animate-spin" />}
                {guardandoRecurrente ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
