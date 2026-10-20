"use client";

import { Field } from "@/components/admin/shared/Field";
import { Plus, ClipboardList } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import POSCustomerSearch from "@/components/admin/pos/POSCustomerSearch";
import { celularDeCaja } from "@/lib/pos/celular-de-caja";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/**
 * Cliente del cobro (en «La venta»): buscar, nuevo cliente y lista. Opcional
 * (deja la venta con su celular para el seguimiento); Fiado lo exige. Un
 * celular nuevo se da de alta CON la venta (`/api/sales`): sólo el celular,
 * el nombre es opcional, y una venta que no se cobra no deja clientes sueltos
 * (además `/api/customers` es sólo de administración: el cajero no podía darlas de alta).
 */
export default function PagoCliente({ p }: { p: PagoModal }) {
  const { onRepeatOrder, customerPhone, setCustomerPhone, customerName, setCustomerName, setShowCustomerList, showNewCustomer, setShowNewCustomer, newCustName, setNewCustName, newCustPhone, setNewCustPhone, isFiado } = p;
  const celularNuevo = celularDeCaja(newCustPhone);
  return (
    <>
            <div className="min-w-0 space-y-2" data-pago-cliente="">
              <div className="flex items-center gap-2">
                <Kicker as="h3">Cliente</Kicker>
                <span className={cn(
                  "text-xs font-semibold",
                  isFiado ? "text-[var(--data-error-ink)]" : "text-[var(--text-tertiary)]",
                )}>
                  {isFiado ? "· Requerido para fiar" : "· Opcional · para el seguimiento"}
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
                <p className="text-sm font-bold text-[var(--text-primary)]">Nuevo cliente <span className="font-normal text-[var(--text-tertiary)]">· se guarda con la venta</span></p>

                <div className="space-y-3">
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
                    {newCustPhone.length === 9 && !celularNuevo && (
                      <p className="text-sm text-[var(--data-warning-ink)] mt-1.5">Un celular empieza con 9</p>
                    )}
                    </>
                    )}
                  </Field>
                  <Field label="Nombre (opcional)" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">
                    <input
                      type="text"
                      value={newCustName}
                      onChange={e => setNewCustName(e.target.value)}
                      placeholder="Ej: Maria Rodriguez"
                      className="w-full px-4 h-11 text-base border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] transition-all"
                    />
                  </Field>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    disabled={!celularNuevo}
                    onClick={() => {
                      if (!celularNuevo) return;
                      setCustomerPhone(celularNuevo);
                      setCustomerName(newCustName.trim());
                      setShowNewCustomer(false);
                      setNewCustName("");
                      setNewCustPhone("");
                    }}
                    className="flex-1 min-h-11 rounded-xl bg-[var(--accent-dark)] text-white text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="h-5 w-5" />
                    Usar en esta venta
                  </button>
                  <button
                    type="button"
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
