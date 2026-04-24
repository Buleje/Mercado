"use client";

import { CardTitle } from "@buleje/design-system";
import { X, Printer, Check, Phone, ExternalLink, FileText, UserCheck } from "@buleje/design-system/icons";
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

  const initial = order.customer.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="modal-backdrop flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del pedido de ${order.customer.name}`}
    >
      <div
        className="bg-[var(--surface-canvas)] w-full max-w-2xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header editorial Holded */}
        <header className="flex items-start justify-between px-6 py-5 border-b border-[var(--rule-soft)] shrink-0 bg-[var(--surface-raised)]">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl shrink-0 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-xl font-black tracking-tight"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)] mb-0.5">
                Pedido
              </p>
              <CardTitle className="text-xl font-black tracking-[-0.01em] text-[var(--text-primary)] truncate">
                {order.customer.name}
              </CardTitle>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                #{order.id.slice(-8)} · {formatDate(order.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
              title="Imprimir ticket / Boleta"
              aria-label="Imprimir ticket o boleta"
            >
              <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              aria-label="Cerrar panel"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1 bg-[var(--surface-canvas)]">
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
                          ? "bg-[var(--accent-soft)] border-[var(--data-success)]/30 text-white"
                          : step.current && !isCanceled
                          ? "bg-[var(--accent-soft)] border-[var(--data-success)]/30 text-white animate-pulse"
                          : step.current && isCanceled
                          ? "bg-[var(--data-error)] border-[var(--data-error)] text-white"
                          : "bg-white dark:bg-card border-[var(--rule-base)] dark:border-gray-600 text-[var(--text-tertiary)]"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <p
                        className={cn(
                          "text-xs font-bold",
                          step.completed
                            ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                            : step.current && !isCanceled
                            ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                            : step.current && isCanceled
                            ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                            : "text-[var(--text-tertiary)]"
                        )}
                      >
                        {step.label}
                      </p>
                      {step.timestamp && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{step.timestamp}</p>
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
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
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
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
                />
                <button
                  onClick={() => onSaveDeliveryDriver(order.id)}
                  disabled={savingDriver || (!deliveryDriver && !customDriver.trim())}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDriver ? "..." : "Asignar"}
                </button>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Cliente</p>
            <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{order.customer.name}</p>
            {order.customer.phone && (
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted flex items-center gap-1.5">
                <Phone className="h-4 w-4 shrink-0" /> {order.customer.phone}
              </p>
            )}
          </div>

          {/* Location */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Dirección</p>
            <div className="flex items-start gap-2">
              <p className="text-sm text-[var(--text-primary)] dark:text-foreground flex-1">{order.customer.location}</p>
              <a
                href={googleMapsUrl(order.customer.location)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1 rounded-lg text-[var(--data-success)] hover:bg-[var(--accent-soft)] transition-colors"
                title="Abrir en Google Maps"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            {order.customer.reference && (
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Ref: {order.customer.reference}</p>
            )}
          </div>

          {/* Payment */}
          {order.paymentMethod && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Pago</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                  order.paymentMethod === "yape" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--accent-soft)] text-[var(--data-success)]"
                )}>
                  {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                </span>
                {order.yapeOperationNumber && (
                  <span className="text-[var(--text-secondary)] dark:text-muted font-mono text-xs">Nº Op. {order.yapeOperationNumber}</span>
                )}
                {order.paymentMethod === "efectivo" && order.deuda && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error)]">
                    Deuda pendiente
                  </span>
                )}
                {order.paymentMethod === "efectivo" && order.deuda === false && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--data-success)]">
                    Cobrado
                  </span>
                )}
              </div>
              {order.paymentMethod === "yape" && order.status === "pendiente" && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onVerifyYape(order.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--data-success)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors border border-[var(--data-success)]/30"
                  >
                    <Check className="h-4 w-4" /> Confirmar Yape
                  </button>
                  <button
                    onClick={() => onRejectYape(order.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--data-error)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] transition-colors border border-[var(--data-error)]"
                  >
                    <X className="h-4 w-4" /> Yape falso
                  </button>
                </div>
              )}
              {order.paymentMethod === "efectivo" && order.deuda && (
                <button
                  onClick={() => onMarkDeudaPaid(order.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--data-success)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors border border-[var(--data-success)]/30 mt-1"
                >
                  <Check className="h-4 w-4" /> Marcar como cobrado
                </button>
              )}
            </div>
          )}

          {/* Customer Notes */}
          {order.notes && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Notas del cliente</p>
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted italic">{order.notes}</p>
            </div>
          )}

          {/* Admin Internal Notes */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Notas internas del equipo</p>
            {adminNotes && (
              <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/10 border border-[var(--data-warning)] dark:border-[var(--data-warning)] rounded-xl p-3">
                <pre className="text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)] whitespace-pre-wrap font-sans">{adminNotes}</pre>
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={adminNote}
                onChange={e => onAdminNoteChange(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onSaveAdminNote(order.id)}
                placeholder="Agregar nota interna..."
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
              />
              <button
                onClick={() => onSaveAdminNote(order.id)}
                disabled={savingNote || !adminNote.trim()}
                className="px-3 py-2 rounded-lg bg-[var(--data-warning-100)] text-[var(--data-warning)] text-xs font-bold hover:bg-[var(--data-warning)] transition-colors disabled:opacity-50"
              >
                {savingNote ? "..." : "Guardar"}
              </button>
            </div>
          </div>

          {/* Quick Reject */}
          {order.status !== "cancelado" && order.status !== "entregado" && (
            <button
              onClick={() => onShowRejectModal(order.id)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error)] text-sm font-bold hover:bg-[var(--data-error-100)] transition-colors border border-[var(--data-error)]"
            >
              <X className="h-4 w-4" />
              Rechazar pedido (con motivo)
            </button>
          )}

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Productos</p>
            <div className="rounded-xl border border-[var(--rule-soft)] dark:border-card-border divide-y divide-gray-100 overflow-hidden">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                  <span className="text-[var(--text-primary)] dark:text-foreground">
                    {item.quantity}× {item.name} <span className="text-[var(--text-tertiary)] dark:text-muted">({item.unit})</span>
                  </span>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">
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
                      <span className="text-[var(--text-secondary)] dark:text-muted">Subtotal</span>
                      <span className="text-[var(--text-primary)] dark:text-foreground">S/{subtotal.toFixed(2)}</span>
                    </div>
                    {(order.discountAmount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-3 py-2 text-sm bg-[var(--accent-soft)]/60 dark:bg-[var(--accent-muted)]">
                        <span className="text-[var(--data-success)] dark:text-[var(--data-success)] font-semibold">
                          Descuento promo{order.appliedPromoId ? ` (${order.appliedPromoId})` : ""}
                        </span>
                        <span className="font-bold text-[var(--data-success)]">−S/{(order.discountAmount!).toFixed(2)}</span>
                      </div>
                    )}
                    {(order.couponDiscount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-3 py-2 text-sm bg-[var(--accent-soft)]/60 dark:bg-[var(--accent-muted)]">
                        <span className="text-[var(--data-success)] dark:text-[var(--data-success)] font-semibold">
                          Cupón{order.appliedCouponCode ? ` ${order.appliedCouponCode}` : ""}
                        </span>
                        <span className="font-bold text-[var(--data-success)]">−S/{(order.couponDiscount!).toFixed(2)}</span>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex justify-between items-center px-3 py-3 bg-[var(--surface-sunken)] font-bold text-base">
                <span className="text-[var(--text-primary)] uppercase tracking-wider text-sm">Total</span>
                <span className="text-[var(--text-primary)] text-xl font-black tabular-nums tracking-[-0.02em]">S/{order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-3 items-center text-xs text-[var(--text-tertiary)] dark:text-muted">
            <span>ID: {order.id}</span>
            <span>Fecha: {formatDate(order.createdAt)}</span>
            <span className={cn("inline-flex px-2 py-0.5 rounded-full font-bold", STATUS_COLORS[order.status])}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>

          {/* Invoice CTA tokenizado */}
          <button
            type="button"
            onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-bold hover:bg-[var(--accent)] transition-colors"
          >
            <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
            Generar Boleta
          </button>
        </div>
      </div>
    </div>
  );
}
