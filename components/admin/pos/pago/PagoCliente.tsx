"use client";

import { Field } from "@/components/admin/shared/Field";
import { Plus, Loader2, ClipboardList } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import POSCustomerSearch from "@/components/admin/pos/POSCustomerSearch";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/** Cliente del cobro (en «La venta»): buscar, nuevo cliente y lista. Fiado lo exige. */
export default function PagoCliente({ p }: { p: PagoModal }) {
  const { onRepeatOrder, customerPhone, setCustomerPhone, customerName, setCustomerName, setShowCustomerList, showNewCustomer, setShowNewCustomer, newCustName, setNewCustName, newCustPhone, setNewCustPhone, savingCustomer, setSavingCustomer, isFiado } = p;
  return (
    <>
            <div className="min-w-0 space-y-2" data-pago-cliente="">
              <div className="flex items-center gap-2">
                <Kicker as="h3">Cliente</Kicker>
                <span className={cn(
                  "text-xs font-semibold",
                  isFiado ? "text-[var(--data-error-ink)]" : "text-[var(--text-tertiary)]",
                )}>
                  {isFiado ? "· Requerido para fiar" : "· Opcional"}
                </span>
                {/* «Nuevo» y «Ver clientes» en la misma fila del rótulo. */}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowNewCustomer(!showNewCustomer)}
                    aria-label="Nuevo cliente"
                    aria-expanded={showNewCustomer}
                    title="Nuevo cliente"
                    className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)] transition-colors"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Nuevo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomerList(true)}
                    aria-label="Ver todos los clientes"
                    title="Ver todos los clientes"
                    className="h-10 w-10 rounded-lg inline-flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)] transition-colors"
                  >
                    <ClipboardList className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="min-w-0">

          {/* Customer search */}
          <div>

            {/* Formulario inline nuevo cliente — grande y legible */}
            {showNewCustomer && (
              <div className="mb-3 p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] space-y-3">
                <p className="text-sm font-bold text-[var(--text-primary)]">Nuevo cliente <span className="font-normal text-[var(--text-tertiary)]">· nombre y celular</span></p>

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
                        // `siExiste=usar`: si el celular ya es de un cliente, se elige ése
                        // tal cual (el alta ya no lo pisa) con su nombre y su celular guardado.
                        const res = await fetch("/api/customers?siExiste=usar", {
                          method: "POST",
                          headers: csrfHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({ name: newCustName.trim(), phone: newCustPhone }),
                        });
                        if (res.ok) {
                          const guardado = (await res.json().catch(() => null)) as { phone?: string; name?: string } | null;
                          setCustomerPhone(guardado?.phone || newCustPhone);
                          setCustomerName(guardado?.name || newCustName.trim());
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
                    className="px-5 min-h-11 rounded-xl text-base font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div data-pago-buscar-cliente="">
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
          </div>

              </div>
            </div>
    </>
  );
}
