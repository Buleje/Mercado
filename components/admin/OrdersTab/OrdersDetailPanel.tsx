"use client";

/**
 * OrdersDetailPanel — Modal lateral con detalle del pedido.
 *
 * Estructura (de arriba a abajo, por prioridad operativa):
 *   1. Header: cliente + total + status + acciones
 *   2. Action banner — la acción primaria del estado (Confirmar Yape /
 *      Avanzar a "En camino" / Marcar entregado…)
 *   3. Items + Resumen (lo que vende este pedido)
 *   4. Contacto + Dirección (1 card con botones Llamar/WhatsApp/Mapa)
 *   5. Despacho (DespachoSection — motorizados reales)
 *   6. Pago (método + Nº op + acciones Yape contextuales)
 *   7. Notas (cliente + internas) en sección colapsable
 *   8. Timeline (referencia secundaria)
 *   9. Footer sticky: Rechazar · Generar Boleta · Cerrar
 *
 * Reglas DS (sistema admin, sobrio):
 *   - CardTitle/SectionTitle del DS para headings (NO h1/h2/h3 directos)
 *   - Sin font-display italic (eso es del sistema marketing/store)
 *   - Tokens del DS — 0 hex hardcoded
 */

import { useState } from "react";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import {
  X, Printer, Check, Phone, MapPin as MapPinIcon, FileText, MessageCircle,
  ChevronDown, ChevronRight, ExternalLink,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbOrder } from "@/lib/jsondb";
import { formatDate, getOrderTimeline } from "@/lib/admin-helpers";
import { googleMapsUrl } from "@/lib/order-utils";
import { STATUS_COLORS, STATUS_LABELS } from "./types";
import { DespachoSection } from "./DespachoSection";
import ManualDeliveryModal from "./ManualDeliveryModal";

interface OrdersDetailPanelProps {
  order: DbOrder;
  adminNote: string;
  savingNote: boolean;
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
  onCustomDriverChange: (v: string) => void;
  onSaveCustomDriver: (orderId: string) => void;
  onPatchOrder: (id: string, patch: Partial<DbOrder>) => void;
}

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D+/g, "");
}

export function OrdersDetailPanel({
  order,
  adminNote,
  savingNote,
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
  onCustomDriverChange,
  onSaveCustomDriver,
  onPatchOrder,
}: OrdersDetailPanelProps) {
  const adminNotes = (order as DbOrder & { adminNotes?: string }).adminNotes;
  const initial = order.customer.name.trim().charAt(0).toUpperCase() || "?";
  // FIX 2026-05-07: estado del modal "Entrega manual" — pide método y nota antes
  // de marcar entregado. Persiste auditoria en OrderStatusHistory.note.
  const [manualOpen, setManualOpen] = useState(false);
  const openManual = () => setManualOpen(true);
  const handleManualConfirm = (deliveryReason: string) => {
    setManualOpen(false);
    onPatchOrder(order.id, {
      status: "entregado",
      // deliveryReason no es columna de DbOrder; el server lo extrae y persiste
      // en OrderStatusHistory.note. El cast preserva el tipo abierto.
      ...({ deliveryReason } as unknown as Partial<DbOrder>),
    });
  };
  const phone = order.customer.phone ?? "";
  const phoneDigits = phone ? digitsOnly(phone) : "";
  const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);

  const [notesOpen, setNotesOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // ── Acción primaria contextual por estado ───────────────────────────────
  const actionBanner = (() => {
    if (order.status === "pendiente" && order.paymentMethod === "yape") {
      return {
        label: "Verificar pago Yape",
        sub: order.yapeOperationNumber ? `Nº Op. ${order.yapeOperationNumber}` : "Comprobante adjunto",
        primary: { label: "Confirmar Yape", onClick: () => onVerifyYape(order.id), tone: "success" as const },
        secondary: { label: "Yape falso", onClick: () => onRejectYape(order.id), tone: "danger" as const },
      };
    }
    if (order.status === "pendiente") {
      return {
        label: "Pendiente de confirmar",
        sub: "Marca como confirmado cuando esté listo para preparar",
        primary: { label: "Confirmar pedido", onClick: () => onPatchOrder(order.id, { status: "confirmado" }), tone: "primary" as const },
      };
    }
    if (order.status === "confirmado") {
      return {
        label: "Confirmado · listo para preparar",
        sub: "Marcá cuando empieces a armar el pedido",
        primary: { label: "Empezar preparación", onClick: () => onPatchOrder(order.id, { status: "preparando" }), tone: "primary" as const },
        // FIX 2026-05-07: entrega manual sin pasar por delivery. Abre modal
        // que pide método (mostrador / propia / encargo / otro) + nota
        // opcional, persistido en OrderStatusHistory.note para auditoría.
        secondary: { label: "Entregado (manual)", onClick: openManual, tone: "success" as const },
      };
    }
    if (order.status === "preparando") {
      return {
        label: "Preparando · armando el pedido",
        sub: "Asigná un motorizado abajo y avanzá cuando salga",
        primary: { label: "Marcar en camino", onClick: () => onPatchOrder(order.id, { status: "en_camino" }), tone: "primary" as const },
        secondary: { label: "Entregado (manual)", onClick: openManual, tone: "success" as const },
      };
    }
    if (order.status === "en_camino") {
      return {
        label: "En camino · rumbo al cliente",
        sub: "Confirma cuando reciba el cliente",
        primary: { label: "Marcar entregado", onClick: () => onPatchOrder(order.id, { status: "entregado" }), tone: "success" as const },
      };
    }
    return null;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del pedido de ${order.customer.name}`}
    >
      <div
        className="relative w-full max-w-3xl bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)] rounded-3xl shadow-[var(--shadow-xl)] flex flex-col max-h-[calc(100vh-3rem)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── 1. HEADER — patrón estándar admin (CardTitle DS, sin italic) ── */}
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--rule-soft)] shrink-0 bg-[var(--surface-raised)]">
          <div className="flex items-start gap-3 min-w-0">
            <span
              aria-hidden
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl shrink-0 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-base font-bold tracking-tight"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-0.5">
                Pedido · #{order.id.slice(-8)}
              </p>
              <CardTitle className="text-base font-bold text-[var(--text-primary)] truncate">
                {order.customer.name}
              </CardTitle>
              <div className="text-xs text-[var(--text-tertiary)] mt-1 flex items-center gap-1.5 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                    STATUS_COLORS[order.status],
                  )}
                >
                  {STATUS_LABELS[order.status]}
                </span>
                <span aria-hidden>·</span>
                <span title={formatDate(order.createdAt)}>{relativeTime(order.createdAt)}</span>
                {order.paymentMethod && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Total
            </p>
            <p className="text-xl font-extrabold tabular-nums text-[var(--text-primary)] leading-none">
              S/{Number(order.total).toFixed(2)}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors mt-1"
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </header>

        {/* ─── 2. ACTION BANNER — siguiente paso operativo, sticky ────────── */}
        {actionBanner && (
          <section
            className="shrink-0 px-5 py-3 border-b flex flex-col gap-2 bg-[var(--surface-sunken)] border-[var(--rule-soft)]"
            aria-label="Acción primaria"
          >
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Siguiente paso
              </p>
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                {actionBanner.label}
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {actionBanner.sub}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={actionBanner.primary.onClick}
                className={cn(
                  "inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-semibold transition-colors text-white",
                  actionBanner.primary.tone === "success"
                    ? "bg-[var(--data-success-500)] hover:opacity-90"
                    : "bg-primary hover:bg-primary/90",
                )}
              >
                <Check className="h-4 w-4" strokeWidth={2} />
                {actionBanner.primary.label}
              </button>
              {actionBanner.secondary && (
                <button
                  type="button"
                  onClick={actionBanner.secondary.onClick}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-semibold border bg-white dark:bg-surface transition-colors",
                    actionBanner.secondary.tone === "success"
                      ? "border-[var(--data-success-500)]/40 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/5"
                      : "border-[var(--data-error-500)]/40 text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/5",
                  )}
                >
                  {actionBanner.secondary.tone === "success" ? (
                    <Check className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <X className="h-4 w-4" strokeWidth={2} />
                  )}
                  {actionBanner.secondary.label}
                </button>
              )}
            </div>
          </section>
        )}

        {/* ─── SCROLLABLE BODY ──────────────────────────────────────────── */}
        <div className="overflow-y-auto px-5 py-5 space-y-5 flex-1 bg-[var(--surface-canvas)]">
          {/* ─── 3. ITEMS + RESUMEN ──────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <SectionTitle>Productos</SectionTitle>
              <span className="text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
                {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
              </span>
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
              <ul className="divide-y divide-[var(--rule-soft)]">
                {order.items.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        <span className="text-[var(--accent)] font-bold tabular-nums mr-1">
                          {item.quantity}×
                        </span>
                        {item.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5 tabular-nums">
                        S/{Number(item.price).toFixed(2)} · {item.unit}
                      </p>
                      {item.note && (
                        <p className="text-xs text-[var(--text-secondary)] italic mt-1">
                          “{item.note}”
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)] shrink-0">
                      S/{(item.price * item.quantity).toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
              {/* Resumen */}
              <div className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/40">
                {((order.couponDiscount ?? 0) > 0 || (order.discountAmount ?? 0) > 0) && (
                  <>
                    <div className="flex justify-between items-center px-4 py-1.5 text-xs">
                      <span className="text-[var(--text-secondary)]">Subtotal</span>
                      <span className="text-[var(--text-secondary)] tabular-nums">S/{subtotal.toFixed(2)}</span>
                    </div>
                    {(order.discountAmount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-4 py-1.5 text-xs">
                        <span className="text-[var(--data-success-500)] font-semibold">
                          Descuento{order.appliedPromoId ? ` · ${order.appliedPromoId}` : ""}
                        </span>
                        <span className="font-semibold text-[var(--data-success-500)] tabular-nums">
                          −S/{Number(order.discountAmount).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {(order.couponDiscount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-4 py-1.5 text-xs">
                        <span className="text-[var(--data-success-500)] font-semibold">
                          Cupón{order.appliedCouponCode ? ` · ${order.appliedCouponCode}` : ""}
                        </span>
                        <span className="font-semibold text-[var(--data-success-500)] tabular-nums">
                          −S/{Number(order.couponDiscount).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between items-center px-4 py-2.5 border-t border-[var(--rule-soft)]">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Total a cobrar
                  </span>
                  <span className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                    S/{Number(order.total).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ─── 4. CONTACTO + DIRECCIÓN ─────────────────────────────────── */}
          <section className="space-y-2">
            <SectionTitle>Contacto y entrega</SectionTitle>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
              {/* Teléfono */}
              {phone && (
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[var(--rule-soft)]">
                  <Phone className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} />
                  <span className="font-mono text-sm font-semibold text-[var(--text-primary)] flex-1 min-w-0 truncate">
                    {phone}
                  </span>
                  <a
                    href={`tel:${phoneDigits}`}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    <Phone className="h-3.5 w-3.5" /> Llamar
                  </a>
                  <a
                    href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hola ${order.customer.name}, sobre tu pedido #${order.id.slice(-8)}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-[var(--data-success-500)]/10 border border-[var(--data-success-500)]/30 text-xs font-semibold text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/15 transition-colors"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </div>
              )}

              {/* Dirección */}
              <div className="flex items-start gap-2 px-4 py-2.5">
                <MapPinIcon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {order.customer.location}
                  </p>
                  {order.customer.reference && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      Ref: {order.customer.reference}
                    </p>
                  )}
                </div>
                <a
                  href={googleMapsUrl(order.customer.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Mapa
                </a>
              </div>

              {/* Notas del cliente — inline si existen */}
              {order.notes && (
                <div className="px-4 py-2.5 border-t border-[var(--rule-soft)] bg-[var(--accent-soft)]/30">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                    Nota del cliente
                  </p>
                  <p className="text-sm text-[var(--text-primary)] italic">“{order.notes}”</p>
                </div>
              )}
            </div>
          </section>

          {/* ─── 5. DESPACHO ─────────────────────────────────────────────── */}
          <DespachoSection
            order={order}
            customDriver={customDriver}
            savingDriver={savingDriver}
            driverColor={driverColor}
            onCustomDriverChange={onCustomDriverChange}
            onSaveCustomDriver={onSaveCustomDriver}
            onPatchOrder={onPatchOrder}
          />

          {/* ─── 6. PAGO (extra detail si Yape o deuda) ──────────────────── */}
          {order.paymentMethod && (order.yapeOperationNumber || order.deuda !== undefined) && (
            <section className="space-y-2">
              <SectionTitle>Pago</SectionTitle>
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                    order.paymentMethod === "yape"
                      ? "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)]"
                      : "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30",
                  )}
                >
                  {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                </span>
                {order.yapeOperationNumber && (
                  <span className="font-mono text-xs font-semibold text-[var(--text-secondary)] tabular-nums">
                    Nº Op. {order.yapeOperationNumber}
                  </span>
                )}
                {order.paymentMethod === "efectivo" && order.deuda && (
                  <>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] border border-[var(--data-error-500)]/30">
                      Deuda pendiente
                    </span>
                    <button
                      type="button"
                      onClick={() => onMarkDeudaPaid(order.id)}
                      className="ml-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-semibold text-[var(--data-success-500)] bg-[var(--data-success-500)]/10 hover:bg-[var(--data-success-500)]/15 border border-[var(--data-success-500)]/30 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" /> Marcar cobrado
                    </button>
                  </>
                )}
                {order.paymentMethod === "efectivo" && order.deuda === false && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] border border-[var(--data-success-500)]/30">
                    Cobrado
                  </span>
                )}
              </div>
            </section>
          )}

          {/* ─── 7. NOTAS — colapsable ────────────────────────────────────── */}
          <section>
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="w-full flex items-center gap-2 py-2 group"
              aria-expanded={notesOpen}
            >
              {notesOpen ? (
                <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
              )}
              <SectionTitle className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                Notas internas
              </SectionTitle>
              {adminNotes && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] text-xs font-bold">
                  !
                </span>
              )}
            </button>
            {notesOpen && (
              <div className="space-y-2 mt-2">
                {adminNotes && (
                  <div className="rounded-lg bg-[var(--data-warning-500)]/10 border border-[var(--data-warning-500)]/30 p-3">
                    <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap font-sans leading-relaxed">
                      {adminNotes}
                    </pre>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={adminNote}
                    onChange={(e) => onAdminNoteChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSaveAdminNote(order.id)}
                    placeholder="Agregar nota interna…"
                    className="flex-1 h-10 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => onSaveAdminNote(order.id)}
                    disabled={savingNote || !adminNote.trim()}
                    className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {savingNote ? "…" : "Guardar"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ─── 8. TIMELINE — colapsable, contexto secundario ───────────── */}
          <section>
            <button
              type="button"
              onClick={() => setTimelineOpen((v) => !v)}
              className="w-full flex items-center gap-2 py-2 group"
              aria-expanded={timelineOpen}
            >
              {timelineOpen ? (
                <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
              )}
              <SectionTitle className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                Línea de tiempo
              </SectionTitle>
            </button>
            {timelineOpen && (
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 mt-2">
                <ol className="relative pl-6">
                  <span
                    aria-hidden
                    className="absolute left-2.5 top-3 bottom-3 w-px bg-[var(--rule-base)]"
                  />
                  {getOrderTimeline(order).map((step) => {
                    const Icon = step.icon;
                    const isCanceled = step.status === "cancelado";
                    return (
                      <li key={step.status} className="relative pb-3 last:pb-0">
                        <span
                          className={cn(
                            "absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 shrink-0",
                            step.completed || step.current
                              ? isCanceled
                                ? "bg-[var(--data-error-500)] border-[var(--data-error-500)] text-white"
                                : "bg-[var(--data-success-500)] border-[var(--data-success-500)] text-white"
                              : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-tertiary)]",
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              step.completed || step.current
                                ? isCanceled
                                  ? "text-[var(--data-error-500)]"
                                  : "text-[var(--text-primary)]"
                                : "text-[var(--text-tertiary)]",
                            )}
                          >
                            {step.label}
                          </p>
                          {step.timestamp && (
                            <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0">
                              {step.timestamp}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </section>
        </div>

        {/* ─── 9. FOOTER STICKY — acciones secundarias (peso normal) ──────── */}
        <footer className="shrink-0 px-5 py-3 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] flex items-center gap-2 flex-wrap">
          {order.status !== "cancelado" && order.status !== "entregado" && (
            <button
              type="button"
              onClick={() => onShowRejectModal(order.id)}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm font-semibold text-[var(--data-error-500)] border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 hover:bg-[var(--data-error-500)]/10 transition-colors"
            >
              <X className="h-4 w-4" />
              Rechazar
            </button>
          )}
          <button
            type="button"
            onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white dark:bg-surface hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
            className="ml-auto inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <FileText className="h-4 w-4" strokeWidth={2} />
            Generar boleta
          </button>
        </footer>
      </div>
      <ManualDeliveryModal
        open={manualOpen}
        customerName={order.customer.name}
        onConfirm={handleManualConfirm}
        onCancel={() => setManualOpen(false)}
      />
    </div>
  );
}
