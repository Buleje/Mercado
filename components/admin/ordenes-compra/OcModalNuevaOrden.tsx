"use client";

import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { FileText, Loader2, Check } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import OcNuevaOrdenDatos from "@/components/admin/ordenes-compra/OcNuevaOrdenDatos";
import OcNuevaOrdenProductos from "@/components/admin/ordenes-compra/OcNuevaOrdenProductos";

/** Ventana «Nueva orden». Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcModalNuevaOrden({ oc }: { oc: OrdenesCompra }) {
  const {
    showCreate,
    setShowCreate,
    supplierId,
    items,
    saving,
    discount,
    closeCreateModal,
    createOrder,
    itemsTotal,
    totalConDescuento,
    sobrecostos,
  } = oc;
  return (
    <>
      {/* ─── Create order modal (rediseñado 2026-05-17) ──────────────── */}
      <AdminModal
        open={showCreate}
        onClose={closeCreateModal}
        title="Nueva orden de compra"
        description="Elige proveedor, suma productos y guarda; al llegar la mercadería la marcas como recibida."
        icon={FileText}
        size="lg"
        claveVentana="oc-nueva-orden"
        footer={
          <>
            {items.length > 0 && (
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-[var(--rule-base)]">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Total de la orden
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {items.length} producto{items.length === 1 ? "" : "s"} ·{" "}
                    {items.reduce((s, i) => s + i.quantity, 0)} unidades
                  </p>
                  {discount > 0 && (
                    <p className="text-xs text-[var(--data-success-500)] font-bold mt-0.5">
                      Subtotal {formatCurrency(itemsTotal)} − {discount}% = ahorras{" "}
                      {formatCurrency(itemsTotal - totalConDescuento)}
                    </p>
                  )}
                  {sobrecostos > 0 && (
                    <p className="text-xs text-[var(--text-secondary)] font-bold mt-0.5">
                      + {formatCurrency(sobrecostos)} de traerla · te cuesta{" "}
                      {formatCurrency(totalConDescuento + sobrecostos)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-extrabold text-primary tabular-nums">
                    {formatCurrency(totalConDescuento)}
                  </p>
                  {sobrecostos > 0 && (
                    <p className="text-xs text-[var(--text-tertiary)] font-bold">
                      le pagas al proveedor
                    </p>
                  )}
                </div>
              </div>
            )}
            <ModalFooter>
              <button
                type="button"
                onClick={closeCreateModal}
                className={button({ variant: "secondary" })}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="oc-nueva-orden"
                disabled={saving || !supplierId || items.length === 0}
                className={button({ variant: "primary", className: "gap-2" })}
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                )}
                {saving ? "Guardando…" : "Crear orden de compra"}
              </button>
            </ModalFooter>
          </>
        }
      >
        <form id="oc-nueva-orden" onSubmit={createOrder} className={`space-y-6 ${MODAL_BODY}`}>
          <OcNuevaOrdenDatos oc={oc} />

          <OcNuevaOrdenProductos oc={oc} />
        </form>
      </AdminModal>
    </>
  );
}
