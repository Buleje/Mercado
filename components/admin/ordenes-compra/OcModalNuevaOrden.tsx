"use client";

import { SectionTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X, FileText, Loader2, Check } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import OcNuevaOrdenDatos from "@/components/admin/ordenes-compra/OcNuevaOrdenDatos";
import OcNuevaOrdenProductos from "@/components/admin/ordenes-compra/OcNuevaOrdenProductos";

/** Ventana «Nueva orden». Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcModalNuevaOrden({ oc }: { oc: OrdenesCompra }) {
  const {
    showCreate, setShowCreate, supplierId, items, saving, discount, createModalRef, closeCreateModal,
    ventanaCreate, createOrder, itemsTotal, totalConDescuento, sobrecostos,
  } = oc;
  return (
    <>
      {/* ─── Create order modal (rediseñado 2026-05-17) ──────────────── */}
      {showCreate && (
        <div
          role="presentation"
          className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && !ventanaCreate.fijado && closeCreateModal()}
        >
          <div
            ref={createModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-oc-title"
            tabIndex={-1}
            className="relative bg-[var(--surface-raised)] w-full sm:max-w-3xl sm:rounded-2xl rounded-t-3xl shadow-[var(--shadow-xl)] flex flex-col max-h-[92dvh] border-0 sm:border-2 sm:border-[var(--rule-base)] overflow-hidden">
            {/* Header */}
            <header {...ventanaCreate.asaProps} className="px-5 sm:px-6 py-4 border-b-2 border-[var(--rule-base)] flex items-center gap-3 bg-linear-to-r from-primary/5 to-transparent">
              <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/15 border border-primary/30 shrink-0">
                <FileText className="h-6 w-6 text-primary" strokeWidth={2.2} />
              </span>
              <div className="flex-1 min-w-0">
                <SectionTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]" id="create-oc-title">Nueva orden de compra</SectionTitle>
                <p className="text-sm text-[var(--text-secondary)]">Elige proveedor, suma productos y guarda. Después puedes marcarla como recibida cuando llegue la mercadería.</p>
              </div>
              <span className="ml-auto flex items-center gap-1 shrink-0">
                <ControlesDeVentana ventana={ventanaCreate} />
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  aria-label="Cerrar"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </span>
            </header>

            {/* Body */}
            <form onSubmit={createOrder} className="flex-1 overflow-y-auto">
              <div className="px-5 sm:px-6 py-5 space-y-6">
                <OcNuevaOrdenDatos oc={oc} />

                <OcNuevaOrdenProductos oc={oc} />
              </div>

              {/* Footer sticky con total + acciones */}
              <footer className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-5 sm:px-6 py-4">
                {items.length > 0 && (
                  <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-[var(--rule-base)]">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Total de la orden</p>
                      <p className="text-xs text-[var(--text-secondary)]">{items.length} producto{items.length === 1 ? "" : "s"} · {items.reduce((s, i) => s + i.quantity, 0)} unidades</p>
                      {discount > 0 && (
                        <p className="text-xs text-[var(--data-success-500)] font-bold mt-0.5">
                          Subtotal {formatCurrency(itemsTotal)} − {discount}% = ahorras {formatCurrency(itemsTotal - totalConDescuento)}
                        </p>
                      )}
                      {sobrecostos > 0 && (
                        <p className="text-xs text-[var(--text-secondary)] font-bold mt-0.5">
                          + {formatCurrency(sobrecostos)} de traerla · te cuesta {formatCurrency(totalConDescuento + sobrecostos)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-extrabold text-primary tabular-nums">
                        {formatCurrency(totalConDescuento)}
                      </p>
                      {sobrecostos > 0 && (
                        <p className="text-xs text-[var(--text-tertiary)] font-bold">le pagas al proveedor</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 h-12 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !supplierId || items.length === 0}
                    className="flex-1 sm:flex-[2] inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
                    {saving ? "Guardando…" : "Crear orden de compra"}
                  </button>
                </div>
              </footer>
            </form>
            <TiradorDeVentana ventana={ventanaCreate} />
          </div>
        </div>
      )}
    </>
  );
}
