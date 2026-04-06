"use client";

import { X, Printer, Store } from "lucide-react";
import type { DbOrder } from "@/lib/jsondb";
import { STATUS_LABELS } from "./types";

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
  const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
          <div>
            <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Vista previa de impresión</h3>
            <p className="text-xs text-gray-400 dark:text-muted mt-0.5">
              {selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? "s" : ""} seleccionado{selectedOrderIds.size > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          <div id="print-content" className="space-y-6">
            {selectedOrders.map((order) => {
              const driver = (order as DbOrder & { deliveryDriver?: string }).deliveryDriver;
              return (
                <div
                  key={order.id}
                  className="bg-white border-2 border-gray-300 rounded-lg p-4 print:break-after-page print:border-0 print:rounded-none"
                  style={{ pageBreakAfter: "always" }}
                >
                  {/* Header */}
                  <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-gray-300">
                    <div className="w-16 h-16 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                      <Store className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-lg font-extrabold text-gray-900">{storeName || "Mi Bodega"}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Ticket de Delivery</p>
                  </div>

                  {/* Order info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-gray-600">Pedido #:</span>
                      <span className="font-mono font-bold">{order.id.slice(-8).toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-gray-600">Fecha:</span>
                      <span>{new Date(order.createdAt).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-gray-600">Estado:</span>
                      <span className="font-bold text-primary">{STATUS_LABELS[order.status]}</span>
                    </div>
                    {driver && (
                      <div className="flex justify-between text-sm">
                        <span className="font-bold text-gray-600">Delivery:</span>
                        <span className="font-bold" style={{ color: driverColor(driver) }}>{driver}</span>
                      </div>
                    )}
                  </div>

                  {/* Customer */}
                  <div className="mb-4 pb-3 border-b border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Cliente</p>
                    <p className="font-bold text-gray-900">{order.customer.name}</p>
                    {order.customer.phone && (
                      <p className="text-sm text-gray-600 font-mono">{order.customer.phone}</p>
                    )}
                    <p className="text-sm text-gray-600 mt-1">{order.customer.location}</p>
                    {order.customer.reference && (
                      <p className="text-xs text-gray-500 mt-0.5">Ref: {order.customer.reference}</p>
                    )}
                  </div>

                  {/* Items */}
                  <div className="mb-4">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Productos</p>
                    <div className="space-y-1">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="flex-1">
                            <span className="font-bold">{item.quantity}×</span> {item.name}
                            <span className="text-gray-400 text-xs ml-1">({item.unit})</span>
                          </span>
                          <span className="font-semibold">S/{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment */}
                  <div className="mb-4 pb-3 border-b-2 border-gray-300">
                    {order.paymentMethod && (
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-bold text-gray-600">Método de pago:</span>
                        <span className="font-bold">
                          {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                        </span>
                      </div>
                    )}
                    {order.deuda && (
                      <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                        <p className="text-xs font-bold text-red-700">DEUDA PENDIENTE DE COBRO</p>
                      </div>
                    )}
                  </div>

                  {/* Total */}
                  <div className="bg-gray-100 rounded-lg p-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-extrabold text-gray-900">TOTAL</span>
                      <span className="text-2xl font-extrabold text-primary">S/{order.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
                      <p className="text-xs font-bold text-yellow-800 mb-0.5">Notas del cliente:</p>
                      <p className="text-xs text-yellow-700">{order.notes}</p>
                    </div>
                  )}
                  {(order as DbOrder & { adminNotes?: string }).adminNotes && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 mb-3">
                      <p className="text-xs font-bold text-orange-800 mb-0.5">Notas internas:</p>
                      <p className="text-xs text-orange-700 whitespace-pre-wrap">
                        {(order as DbOrder & { adminNotes?: string }).adminNotes}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="text-center pt-3 border-t border-dashed border-gray-300">
                    <p className="text-xs text-gray-500">¡Gracias por tu compra!</p>
                    <p className="text-xs text-gray-400 mt-1">Productos frescos · Entrega directa</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
