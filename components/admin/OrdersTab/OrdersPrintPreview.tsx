"use client";

import { SectionTitle } from "@buleje/design-system";
import { Printer, Store } from "@buleje/design-system/icons";
import type { DbOrder } from "@/lib/jsondb";
import { responsableDe } from "./siguiente-paso";
import { STATUS_LABELS, nombreDelPago } from "./types";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

interface OrdersPrintPreviewProps {
  orders: DbOrder[];
  selectedOrderIds: Set<string>;
  storeName: string;
  driverColor: (name: string) => string;
  onClose: () => void;
}

export function OrdersPrintPreview({
  orders,
  selectedOrderIds,
  storeName,
  driverColor,
  onClose,
}: OrdersPrintPreviewProps) {
  const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id));

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Vista previa de impresión"
      description={`${selectedOrderIds.size} pedido${selectedOrderIds.size > 1 ? "s" : ""} seleccionado${selectedOrderIds.size > 1 ? "s" : ""}`}
      icon={Printer}
      size="planilla"
      claveVentana="pedidos-vista-previa-impresion"
      footer={
        <ModalFooter>
          <button onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button onClick={() => window.print()} className={button({ variant: "primary" })}>
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <div id="print-content" className="space-y-6">
          {selectedOrders.map((order) => {
            const driver = responsableDe(order);
            return (
              <div
                key={order.id}
                className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg p-4 print:break-after-page print:border-0 print:rounded-none"
                style={{ pageBreakAfter: "always" }}
              >
                {/* Header */}
                <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-[var(--rule-base)]">
                  <div className="w-16 h-16 mx-auto mb-2 bg-[var(--rule-soft)] rounded-full flex items-center justify-center">
                    <Store className="h-8 w-8 text-primary" />
                  </div>
                  <SectionTitle className="text-lg font-extrabold text-[var(--text-primary)]">
                    {storeName || "Buleje"}
                  </SectionTitle>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">Ticket de Delivery</p>
                </div>

                {/* Order info */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-[var(--text-secondary)]">Pedido #:</span>
                    <span className="font-mono font-bold">{order.id.slice(-8).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-[var(--text-secondary)]">Fecha:</span>
                    <span>{formatDateTimeShort(order.createdAt)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-[var(--text-secondary)]">Estado:</span>
                    <span className="font-bold text-primary">{STATUS_LABELS[order.status]}</span>
                  </div>
                  {driver && (
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-[var(--text-secondary)]">Delivery:</span>
                      <span className="font-bold" style={{ color: driverColor(driver) }}>
                        {driver}
                      </span>
                    </div>
                  )}
                </div>

                {/* Customer */}
                <div className="mb-4 pb-3 border-b border-[var(--rule-base)]">
                  <p className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1">
                    Cliente
                  </p>
                  <p className="font-bold text-[var(--text-primary)]">{order.customer.name}</p>
                  {order.customer.phone && (
                    <p className="text-sm text-[var(--text-secondary)] font-mono">
                      {order.customer.phone}
                    </p>
                  )}
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {order.customer.location}
                  </p>
                  {order.customer.reference && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Ref: {order.customer.reference}
                    </p>
                  )}
                </div>

                {/* Items */}
                <div className="mb-4">
                  <p className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                    Productos
                  </p>
                  <div className="space-y-1">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="flex-1">
                          <span className="font-bold">{item.quantity}×</span> {item.name}
                          <span className="text-[var(--text-tertiary)] text-xs ml-1">
                            ({item.unit})
                          </span>
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment */}
                <div className="mb-4 pb-3 border-b-2 border-[var(--rule-base)]">
                  {order.paymentMethod && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-[var(--text-secondary)]">
                        Método de pago:
                      </span>
                      <span className="font-bold">{nombreDelPago(order.paymentMethod)}</span>
                    </div>
                  )}
                  {order.deuda && (
                    <div className="bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded p-2 mt-2">
                      <p className="text-xs font-bold text-[var(--data-error-500)]">
                        DEUDA PENDIENTE DE COBRO
                      </p>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="bg-[var(--rule-soft)] rounded-lg p-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-extrabold text-[var(--text-primary)]">TOTAL</span>
                    <span className="text-2xl font-extrabold text-primary">
                      {formatCurrency(Number(order.total))}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                {order.notes && (
                  <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-lg p-2 mb-3">
                    <p className="text-xs font-bold text-[var(--data-warning-500)] mb-0.5">
                      Notas del cliente:
                    </p>
                    <p className="text-xs text-[var(--data-warning-500)]">{order.notes}</p>
                  </div>
                )}
                {(order as DbOrder & { adminNotes?: string }).adminNotes && (
                  <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-lg p-2 mb-3">
                    <p className="text-xs font-bold text-[var(--data-warning-500)] mb-0.5">
                      Notas internas:
                    </p>
                    <p className="text-xs text-[var(--data-warning-500)] whitespace-pre-wrap">
                      {(order as DbOrder & { adminNotes?: string }).adminNotes}
                    </p>
                  </div>
                )}

                {/* Footer */}
                <div className="text-center pt-3 border-t border-dashed border-[var(--rule-base)]">
                  <p className="text-xs text-[var(--text-secondary)]">¡Gracias por tu compra!</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Productos frescos · Entrega directa
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminModal>
  );
}
