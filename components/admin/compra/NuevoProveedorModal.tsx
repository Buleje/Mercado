"use client";

import { CardTitle } from "@buleje/design-system";
import { Check as CheckIcon, Loader2, X as XIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import type { NuevoProveedor } from "./use-nuevo-proveedor";

/** Modal crear nuevo proveedor — mini-form vinculado a /api/suppliers. */
export default function NuevoProveedorModal({ np }: { np: NuevoProveedor }) {
  const {
    showNewSupplier, setShowNewSupplier, newSupplier, setNewSupplier, creatingSupplier, rucLookup, setRucLookup,
    cerrarNuevoProveedor, nuevoProveedorModalRef, ventanaNuevoProveedor, handleRucLookup, handleCreateSupplier,
  } = np;
  if (!showNewSupplier) return null;
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- clic afuera cierra por mouse; el teclado ya cierra con Escape vía useModalAccesible
    <div
      className="fixed inset-0 z-system flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && !ventanaNuevoProveedor.fijado && cerrarNuevoProveedor()}
    >
      <div
        className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-md p-6 space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="punto-compra-nuevo-proveedor"
        ref={nuevoProveedorModalRef}
        tabIndex={-1}
      >
        <div {...ventanaNuevoProveedor.asaProps} className="flex items-start justify-between">
          <div>
            <CardTitle as="h3" id="punto-compra-nuevo-proveedor" className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Nuevo proveedor</CardTitle>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Se guarda en tu lista de proveedores y se selecciona en esta orden.
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventanaNuevoProveedor} />
            <button
              type="button"
              onClick={cerrarNuevoProveedor}
              aria-label="Cerrar"
              className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <XIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
            </button>
          </span>
        </div>

        <div className="space-y-3">
          {/* RUC primero — auto-completa el resto */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-ruc">
              RUC <span className="text-[var(--text-tertiary)] font-normal">(autocompleta razón social y dirección)</span>
            </label>
            <div className="relative">
              <input
                id="ns-ruc"
                type="text"
                value={newSupplier.ruc}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 11);
                  setNewSupplier((s) => ({ ...s, ruc: next }));
                  if (next.length === 11) void handleRucLookup(next);
                  else setRucLookup({ status: "idle" });
                }}
                inputMode="numeric"
                placeholder="20XXXXXXXXX"
                className="w-full pl-3 pr-10 h-11 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all font-mono"
              />
              {rucLookup.status === "loading" && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
              )}
              {rucLookup.status === "ok" && (
                <CheckIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--data-success-500)]" />
              )}
            </div>
            {rucLookup.status !== "idle" && rucLookup.msg && (
              <p className={cn(
                "text-xs mt-1 font-medium",
                rucLookup.status === "ok"       ? "text-[var(--data-success-500)]" :
                rucLookup.status === "notfound" ? "text-[var(--data-warning-500)]" :
                rucLookup.status === "loading"  ? "text-[var(--text-tertiary)]" :
                "text-[var(--data-error-500)]"
              )}>
                {rucLookup.status === "loading" ? "Consultando SUNAT..." : rucLookup.msg}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-name">
              Nombre comercial <span className="text-[var(--data-error-500)]">*</span>
            </label>
            <input
              id="ns-name"
              type="text"
              value={newSupplier.name}
              onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && newSupplier.name.trim() && void handleCreateSupplier()}
              placeholder="ej. Distribuidora ABC"
              className="w-full px-3 h-11 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>

          {newSupplier.razonSocial && (
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-razon">
                Razón social
              </label>
              <input
                id="ns-razon"
                type="text"
                value={newSupplier.razonSocial}
                onChange={(e) => setNewSupplier((s) => ({ ...s, razonSocial: e.target.value }))}
                className="w-full px-3 h-11 text-sm rounded-xl border border-[var(--rule-base)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          )}

          {newSupplier.address && (
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-address">
                Dirección
              </label>
              <input
                id="ns-address"
                type="text"
                value={newSupplier.address}
                onChange={(e) => setNewSupplier((s) => ({ ...s, address: e.target.value }))}
                className="w-full px-3 h-11 text-sm rounded-xl border border-[var(--rule-base)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-phone">
                Teléfono
              </label>
              <input
                id="ns-phone"
                type="tel"
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier((s) => ({ ...s, phone: e.target.value }))}
                placeholder="+51 9XX XXX XXX"
                className="w-full px-3 h-11 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-email">
                Email
              </label>
              <input
                id="ns-email"
                type="email"
                value={newSupplier.email}
                onChange={(e) => setNewSupplier((s) => ({ ...s, email: e.target.value }))}
                placeholder="ventas@proveedor.com"
                className="w-full px-3 h-11 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            Después puedes completar persona contacto y banco desde el tab <strong>Proveedores</strong>.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => !creatingSupplier && setShowNewSupplier(false)}
            disabled={creatingSupplier}
            className="flex-1 min-h-11 rounded-xl border border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleCreateSupplier()}
            disabled={creatingSupplier || !newSupplier.name.trim()}
            className="flex-1 min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {creatingSupplier ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckIcon className="h-4 w-4" />
            )}
            {creatingSupplier ? "Creando..." : "Crear y seleccionar"}
          </button>
        </div>
        <TiradorDeVentana ventana={ventanaNuevoProveedor} />
      </div>
    </div>
  );
}
