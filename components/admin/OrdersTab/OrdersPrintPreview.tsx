"use client";

/**
 * Tickets de los pedidos elegidos en la Lista: vista previa en la ventana y,
 * al imprimir, los MISMOS tickets desde un portal hijo de `<body>`.
 *
 * 17-10 (P12): salían en hoja blanca. `#print-content` vivía dentro del
 * AdminModal y el `@media print` de globals.css esconde `.fixed` (el diálogo
 * lo es) y todo `body *`. Ahora la hoja es un portal con la receta de
 * `imprimir-pedidos.ts`, en claro aunque el panel esté oscuro. Se fueron las
 * «notas internas» (leían `adminNotes`, que el servidor no manda; las notas
 * viven en el historial y son internas: no van en el ticket del cliente).
 */
import { createPortal } from "react-dom";
import { SectionTitle } from "@buleje/design-system";
import { Printer, Store } from "@buleje/design-system/icons";
import type { DbOrder } from "@/lib/jsondb";
import { responsableDe } from "./siguiente-paso";
import { STATUS_LABELS, nombreDelPago } from "./types";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { cssImpresion, imprimirEnClaro, nombreDelPdf } from "./imprimir-pedidos";

const ID_TICKETS = "pedidos-hoja-tickets";
const CSS_TICKETS = cssImpresion(ID_TICKETS, "size: 80mm auto; margin: 4mm");

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
  const tokens = usePanelTokens(true);
  const n = selectedOrders.length;
  const tickets = selectedOrders.map((order) => (
    <TicketPedido key={order.id} order={order} storeName={storeName} driverColor={driverColor} />
  ));

  return (
    <>
    <AdminModal
      open
      onClose={onClose}
      title="Vista previa de impresión"
      description={`${n} ${n === 1 ? "pedido elegido" : "pedidos elegidos"}`}
      icon={Printer}
      size="planilla"
      claveVentana="pedidos-vista-previa-impresion"
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => imprimirEnClaro(nombreDelPdf("tickets", new Date()))}
            disabled={n === 0}
            className={button({ variant: "primary" })}
          >
            <Printer className="h-4 w-4" aria-hidden />
            Imprimir
          </button>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <div className="space-y-6">{tickets}</div>
      </div>
    </AdminModal>
    {typeof document !== "undefined" &&
      createPortal(
        <div id={ID_TICKETS} className="hidden print:block" style={tokens} aria-hidden>
          <style>{CSS_TICKETS}</style>
          {tickets}
        </div>,
        document.body,
      )}
    </>
  );
}

function TicketPedido({
  order,
  storeName,
  driverColor,
}: {
  order: DbOrder;
  storeName: string;
  driverColor: (name: string) => string;
}) {
  const driver = responsableDe(order);
  return (
              <div
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
                {/* Footer */}
                <div className="text-center pt-3 border-t border-dashed border-[var(--rule-base)]">
                  <p className="text-xs text-[var(--text-secondary)]">¡Gracias por tu compra!</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Productos frescos · Entrega directa
                  </p>
                </div>
              </div>
  );
}
