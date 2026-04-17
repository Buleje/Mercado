"use client";

import { X, Printer, Check, Phone, ExternalLink, FileText, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbOrder } from "@/lib/jsondb";
import { formatDate, getOrderTimeline } from "@/lib/admin-helpers";
import { googleMapsUrl } from "@/lib/order-utils";
import { STATUS_COLORS, STATUS_LABELS, DRIVERS } from "./types";

interface OrdersDetailPanelProps {
  order: DbOrder;
  adminNote: string;
  savingNote: boolean;
  deliveryDriver: string;
  customDriver: string;
  savingDriver: boolean;
  driverColor: (name: string) => string;
  onClose: () => void;
  onAdminNoteChange: (v: string) => void;
  onSaveAdminNote: (orderId: string) => void;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onMarkDeudaPaid: (id: string) => void;
  onShowRejectModal: (id: string) => void;
  onDeliveryDriverChange: (v: string) => void;
  onCustomDriverChange: (v: string) => void;
  onSaveDeliveryDriver: (orderId: string) => void;
  onPatchOrder: (id: string, patch: Partial<DbOrder>) => void;
}

export function OrdersDetailPanel({
  order,
  adminNote,
  savingNote,
  deliveryDriver,
  customDriver,
  savingDriver,
  driverColor,
  onClose,
  onAdminNoteChange,
  onSaveAdminNote,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
  onShowRejectModal,
  onDeliveryDriverChange,
  onCustomDriverChange,
  onSaveDeliveryDriver,
  onPatchOrder,
}: OrdersDetailPanelProps) {
  const currentDriver = (order as DbOrder & { deliveryDriver?: string }).deliveryDriver;
  const adminNotes = (order as DbOrder & { adminNotes?: string }).adminNotes;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-card rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border shrink-0">
          <div>
            <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Detalle del pedido</h3>
            <p className="text-xs text-gray-400 dark:text-muted mt-0.5">
              {order.customer.name} · {formatDate(order.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
              className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-primary hover:bg-primary/10 transition-colors"
              title="Imprimir ticket / Boleta"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {/* Visual Timeline */}
          <div className="bg-[var(--surface-sunken)] rounded-xl p-4 border border-[var(--rule-base)]">
            <p className="text-xs font-bold text-[var(--text-secondary)] mb-3">Estado del Pedido</p>
            <div className="flex items-center justify-between gap-2 relative">
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" style={{ zIndex: 0 }} />
              {getOrderTimeline(order).map((step) => {
                const Icon = step.icon;
                const isCanceled = step.status === "cancelado";
                return (
                  <div key={step.status} className="flex flex-col items-center gap-1.5 relative" style={{ flex: isCanceled ? 0.7 : 1, zIndex: 1 }}>
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                        step.completed
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : step.current && !isCanceled
                          ? "bg-emerald-500 border-emerald-500 text-white animate-pulse"
                          : step.current && isCanceled
                          ? "bg-red-500 border-red-500 text-white"
                          : "bg-white dark:bg-card border-[var(--rule-base)] dark:border-gray-600 text-gray-400 dark:text-gray-500"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <p
                        className={cn(
                          "text-xs font-bold",
                          step.completed
                            ? "text-emerald-700 dark:text-emerald-400"
                            : step.current && !isCanceled
                            ? "text-emerald-700 dark:text-emerald-400"
                            : step.current && isCanceled
                            ? "text-red-700 dark:text-red-400"
                            : "text-gray-500 dark:text-gray-500"
                        )}
                      >
                        {step.label}
                      </p>
                      {step.timestamp && (
                        <p className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 mt-0.5">{step.timestamp}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery Driver Assignment */}
          <div className="bg-[var(--surface-sunken)] rounded-xl p-4 border border-[var(--rule-base)]">
            <p className="text-xs font-bold text-[var(--text-secondary)] mb-3">Asignar Delivery</p>
            {currentDriver && (
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: driverColor(currentDriver) }}
                >
                  <UserCheck className="h-4 w-4" /> {currentDriver}
                </span>
                <button
                  onClick={() => onPatchOrder(order.id, { deliveryDriver: "" } as Partial<DbOrder>)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                >
                  Cambiar
                </button>
              </div>
            )}
            <div className="space-y-2">
              <select
                value={deliveryDriver}
                onChange={(e) => onDeliveryDriverChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 text-sm text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
              >
                <option value="">Seleccionar delivery...</option>
                {DRIVERS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customDriver}
                  onChange={(e) => onCustomDriverChange(e.target.value)}
                  placeholder="O escribe nombre personalizado..."
                  className="flex-1 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 text-sm text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
                />
                <button
                  onClick={() => onSaveDeliveryDriver(order.id)}
                  disabled={savingDriver || (!deliveryDriver && !customDriver.trim())}
                  className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDriver ? "..." : "Asignar"}
                </button>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-400 dark:text-muted">Cliente</p>
            <p className="font-bold text-gray-900 dark:text-foreground">{order.customer.name}</p>
            {order.customer.phone && (
              <p className="text-sm text-gray-500 dark:text-muted flex items-center gap-1.5">
                <Phone className="h-4 w-4 shrink-0" /> {order.customer.phone}
              </p>
            )}
          </div>

          {/* Location */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-400 dark:text-muted">Dirección</p>
            <div className="flex items-start gap-2">
              <p className="text-sm text-gray-700 dark:text-foreground flex-1">{order.customer.location}</p>
              <a
                href={googleMapsUrl(order.customer.location)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors"
                title="Abrir en Google Maps"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            {order.customer.reference && (
              <p className="text-xs text-gray-500 dark:text-muted">Ref: {order.customer.reference}</p>
            )}
          </div>

          {/* Payment */}
          {order.paymentMethod && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-400 dark:text-muted">Pago</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                  order.paymentMethod === "yape" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-emerald-100 text-emerald-700"
                )}>
                  {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                </span>
                {order.yapeOperationNumber && (
                  <span className="text-gray-500 dark:text-muted font-mono text-xs">Nº Op. {order.yapeOperationNumber}</span>
                )}
                {order.paymentMethod === "efectivo" && order.deuda && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                    Deuda pendiente
                  </span>
                )}
                {order.paymentMethod === "efectivo" && order.deuda === false && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                    Cobrado
                  </span>
                )}
              </div>
              {order.paymentMethod === "yape" && order.status === "pendiente" && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onVerifyYape(order.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                  >
                    <Check className="h-4 w-4" /> Confirmar Yape
                  </button>
                  <button
                    onClick={() => onRejectYape(order.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                  >
                    <X className="h-4 w-4" /> Yape falso
                  </button>
                </div>
              )}
              {order.paymentMethod === "efectivo" && order.deuda && (
                <button
                  onClick={() => onMarkDeudaPaid(order.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200 mt-1"
                >
                  <Check className="h-4 w-4" /> Marcar como cobrado
                </button>
              )}
            </div>
          )}

          {/* Customer Notes */}
          {order.notes && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-400 dark:text-muted">Notas del cliente</p>
              <p className="text-sm text-gray-600 dark:text-muted italic">{order.notes}</p>
            </div>
          )}

          {/* Admin Internal Notes */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 dark:text-muted">Notas internas del equipo</p>
            {adminNotes && (
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                <pre className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-wrap font-sans">{adminNotes}</pre>
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={adminNote}
                onChange={e => onAdminNoteChange(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onSaveAdminNote(order.id)}
                placeholder="Agregar nota interna..."
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary"
              />
              <button
                onClick={() => onSaveAdminNote(order.id)}
                disabled={savingNote || !adminNote.trim()}
                className="px-3 py-2 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200 transition-colors disabled:opacity-50"
              >
                {savingNote ? "..." : "Guardar"}
              </button>
            </div>
          </div>

          {/* Quick Reject */}
          {order.status !== "cancelado" && order.status !== "entregado" && (
            <button
              onClick={() => onShowRejectModal(order.id)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-colors border border-red-200"
            >
              <X className="h-4 w-4" />
              Rechazar pedido (con motivo)
            </button>
          )}

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 dark:text-muted">Productos</p>
            <div className="rounded-xl border border-[var(--rule-soft)] dark:border-card-border divide-y divide-gray-100 overflow-hidden">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                  <span className="text-gray-700 dark:text-foreground">
                    {item.quantity}× {item.name} <span className="text-gray-400 dark:text-muted">({item.unit})</span>
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-foreground">
                    S/{(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              {/* Discount breakdown */}
              {((order.couponDiscount ?? 0) > 0 || (order.discountAmount ?? 0) > 0) && (() => {
                const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                return (
                  <>
                    <div className="flex justify-between items-center px-3 py-2 text-sm bg-gray-50/60 dark:bg-surface/40">
                      <span className="text-gray-500 dark:text-muted">Subtotal</span>
                      <span className="text-gray-700 dark:text-foreground">S/{subtotal.toFixed(2)}</span>
                    </div>
                    {(order.discountAmount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-3 py-2 text-sm bg-emerald-50/60 dark:bg-emerald-900/10">
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          Descuento promo{order.appliedPromoId ? ` (${order.appliedPromoId})` : ""}
                        </span>
                        <span className="font-bold text-emerald-600">−S/{(order.discountAmount!).toFixed(2)}</span>
                      </div>
                    )}
                    {(order.couponDiscount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-3 py-2 text-sm bg-emerald-50/60 dark:bg-emerald-900/10">
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          Cupón{order.appliedCouponCode ? ` ${order.appliedCouponCode}` : ""}
                        </span>
                        <span className="font-bold text-emerald-600">−S/{(order.couponDiscount!).toFixed(2)}</span>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-surface font-bold text-sm">
                <span className="text-gray-800 dark:text-foreground">Total</span>
                <span className="text-primary">S/{order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-3 items-center text-xs text-gray-400 dark:text-muted">
            <span>ID: {order.id}</span>
            <span>Fecha: {formatDate(order.createdAt)}</span>
            <span className={cn("inline-flex px-2 py-0.5 rounded-full font-bold", STATUS_COLORS[order.status])}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>

          {/* Invoice */}
          <button
            onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Generar Boleta
          </button>
        </div>
      </div>
    </div>
  );
}
