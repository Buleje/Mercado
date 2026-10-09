"use client";

import { Field } from "@/components/admin/shared/Field";
import { Plus, Loader2, User, ClipboardList } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import POSCustomerSearch from "@/components/admin/pos/POSCustomerSearch";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/** Tarjeta Cliente del cobro: buscar, nuevo cliente y lista. */
export default function PagoCliente({ p }: { p: PagoModal }) {
  const { onRepeatOrder, customerPhone, setCustomerPhone, customerName, setCustomerName, setShowCustomerList, showNewCustomer, setShowNewCustomer, newCustName, setNewCustName, newCustPhone, setNewCustPhone, savingCustomer, setSavingCustomer, isFiado } = p;
  return (
    <>
            <div className="lg:col-span-3 min-w-0 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--rule-soft)] flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-[var(--data-success-500)]/15 flex items-center justify-center text-[var(--data-success-500)]">
                  <User className="h-4 w-4" />
                </span>
                <Kicker as="h3" className="libro-kicker">Cliente</Kicker>
                <span className={cn(
                  "text-[length:var(--ts-2xs)] font-extrabold uppercase",
                  isFiado ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]",
                )}>
                  {isFiado ? "Requerido" : "Opcional"}
                </span>
                {/* «Nuevo» y «Ver clientes» suben a la cabecera: antes ocupaban una fila propia que repetía «Cliente». */}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowNewCustomer(!showNewCustomer)}
                    aria-label="Nuevo cliente"
                    aria-expanded={showNewCustomer}
                    title="Nuevo cliente"
                    className="h-9 w-9 rounded-lg inline-flex items-center justify-center text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/10 dark:hover:bg-[var(--data-success-500)]/15 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomerList(true)}
                    aria-label="Ver todos los clientes"
                    title="Ver todos los clientes"
                    className="h-9 w-9 rounded-lg inline-flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition-colors"
                  >
                    <ClipboardList className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 space-y-3 min-w-0">

          {/* Customer search */}
          <div>

            {/* Formulario inline nuevo cliente — grande y legible */}
            {showNewCustomer && (
              <div className="mb-3 p-5 rounded-2xl bg-[var(--data-success-500)]/8 dark:bg-[var(--data-success-500)]/12 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[var(--data-success-500)]/15 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-[var(--data-success-500)]" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Nuevo cliente</p>
                    <p className="text-sm text-[var(--data-success-500)]/80 dark:text-[var(--data-success-500)]/80">Nombre + celular, y listo</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Field label="Nombre completo" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">
                    <input
                      type="text"
                      value={newCustName}
                      onChange={e => setNewCustName(e.target.value)}
                      placeholder="Ej: Maria Rodriguez"
                      className="w-full px-4 h-11 text-base border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] transition-all"
                    />
                  </Field>
                  <Field label="Celular (9 dígitos)" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">
                    {(id) => (
                    <>
                    <input
                      id={id}
                      type="tel"
                      value={newCustPhone}
                      onChange={e => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      placeholder="9XX XXX XXX"
                      className="w-full px-4 h-11 text-base tabular-nums border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] transition-all"
                    />
                    {newCustPhone.length > 0 && newCustPhone.length < 9 && (
                      <p className="text-sm text-[var(--text-tertiary)] mt-1.5">Faltan {9 - newCustPhone.length} dígitos</p>
                    )}
                    </>
                    )}
                  </Field>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    disabled={!newCustName.trim() || newCustPhone.length < 9 || savingCustomer}
                    onClick={async () => {
                      setSavingCustomer(true);
                      try {
                        const res = await fetch("/api/customers", {
                          method: "POST",
                          headers: csrfHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({ name: newCustName.trim(), phone: newCustPhone }),
                        });
                        if (res.ok) {
                          setCustomerPhone(newCustPhone);
                          setCustomerName(newCustName.trim());
                          setShowNewCustomer(false);
                          setNewCustName("");
                          setNewCustPhone("");
                        }
                      } catch { /* ignore */ }
                      setSavingCustomer(false);
                    }}
                    className="flex-1 min-h-11 rounded-xl bg-[var(--accent-dark)] text-white text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-colors flex items-center justify-center gap-2"
                  >
                    {savingCustomer ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Plus className="h-5 w-5" />
                        Guardar y seleccionar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { setShowNewCustomer(false); setNewCustName(""); setNewCustPhone(""); }}
                    className="px-5 min-h-11 rounded-xl text-base font-semibold text-[var(--text-secondary)] hover:bg-white dark:hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <POSCustomerSearch
              selectedPhone={customerPhone}
              selectedName={customerName}
              onSelect={(phone, name) => {
                setCustomerPhone(phone);
                setCustomerName(name);
              }}
              onClear={() => {
                setCustomerPhone("");
                setCustomerName("");
              }}
              onRepeatOrder={onRepeatOrder}
            />
          </div>

              </div>{/* fin contenido card Cliente */}
            </div>{/* fin Card Cliente */}
    </>
  );
}
