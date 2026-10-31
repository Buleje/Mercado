"use client";

import { Check as CheckIcon, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { NuevoProveedor } from "./use-nuevo-proveedor";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

/** Modal crear nuevo proveedor — mini-form vinculado a /api/suppliers. */
export default function NuevoProveedorModal({ np }: { np: NuevoProveedor }) {
  const {
    showNewSupplier,
    setShowNewSupplier,
    newSupplier,
    setNewSupplier,
    creatingSupplier,
    rucLookup,
    setRucLookup,
    cerrarNuevoProveedor,
    handleRucLookup,
    handleCreateSupplier,
  } = np;
  if (!showNewSupplier) return null;
  return (
    <AdminModal
      open
      onClose={cerrarNuevoProveedor}
      title="Nuevo proveedor"
      description="Se guarda en tu lista de proveedores y se selecciona en esta orden."
      size="md"
      aboveModals
      claveVentana="pos-nuevo-proveedor"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={() => !creatingSupplier && setShowNewSupplier(false)}
            disabled={creatingSupplier}
            className={button({ variant: "secondary" })}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleCreateSupplier()}
            disabled={creatingSupplier || !newSupplier.name.trim()}
            className={button({ variant: "primary" })}
          >
            {creatingSupplier ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckIcon className="h-4 w-4" />
            )}
            {creatingSupplier ? "Creando..." : "Crear y seleccionar"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {/* RUC primero — auto-completa el resto */}
        <div>
          <label
            className="text-xs font-bold text-[var(--text-secondary)] mb-1 block"
            htmlFor="ns-ruc"
          >
            RUC{" "}
            <span className="text-[var(--text-tertiary)] font-normal">
              (autocompleta razón social y dirección)
            </span>
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
            <p
              className={cn(
                "text-xs mt-1 font-medium",
                rucLookup.status === "ok"
                  ? "text-[var(--data-success-500)]"
                  : rucLookup.status === "notfound"
                    ? "text-[var(--data-warning-500)]"
                    : rucLookup.status === "loading"
                      ? "text-[var(--text-tertiary)]"
                      : "text-[var(--data-error-500)]",
              )}
            >
              {rucLookup.status === "loading" ? "Consultando SUNAT..." : rucLookup.msg}
            </p>
          )}
        </div>

        <div>
          <label
            className="text-xs font-bold text-[var(--text-secondary)] mb-1 block"
            htmlFor="ns-name"
          >
            Nombre comercial <span className="text-[var(--data-error-500)]">*</span>
          </label>
          <input
            id="ns-name"
            type="text"
            value={newSupplier.name}
            onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))}
            onKeyDown={(e) =>
              e.key === "Enter" && newSupplier.name.trim() && void handleCreateSupplier()
            }
            placeholder="ej. Distribuidora ABC"
            className="w-full px-3 h-11 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        {newSupplier.razonSocial && (
          <div>
            <label
              className="text-xs font-bold text-[var(--text-secondary)] mb-1 block"
              htmlFor="ns-razon"
            >
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
            <label
              className="text-xs font-bold text-[var(--text-secondary)] mb-1 block"
              htmlFor="ns-address"
            >
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
            <label
              className="text-xs font-bold text-[var(--text-secondary)] mb-1 block"
              htmlFor="ns-phone"
            >
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
            <label
              className="text-xs font-bold text-[var(--text-secondary)] mb-1 block"
              htmlFor="ns-email"
            >
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
          Después puedes completar persona contacto y banco desde el tab{" "}
          <strong>Proveedores</strong>.
        </p>
      </div>
    </AdminModal>
  );
}
