"use client";

/**
 * OrdersDetailPanel — Modal lateral con detalle del pedido.
 *
 * Estructura (de arriba a abajo, por prioridad operativa):
 *   1. Header editorial: cliente italic + total + status + acciones
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
 * Reglas DS:
 *   - Tipografía editorial Buleje (font-display italic en hero values)
 *   - Tokens del DS — 0 hex hardcoded
 *   - SectionTitle/CardTitle del DS para headings
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
        label: "Confirmado · esperando motorizado",
        sub: "Asigná un motorizado abajo y avanzá cuando salga",
        primary: { label: "Marcar en camino", onClick: () => onPatchOrder(order.id, { status: "en_camino" }), tone: "primary" as const },
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
      className="modal-backdrop flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del pedido de ${order.customer.name}`}
    >
      <div
        className="bg-[var(--surface-canvas)] w-full max-w-3xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── 1. HEADER editorial ──────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4 px-7 py-5 border-b border-[var(--rule-soft)] shrink-0 bg-[var(--surface-raised)]">
          <div className="flex items-start gap-4 min-w-0">
            <span
              aria-hidden
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl shrink-0 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-2xl font-extrabold tracking-tight"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Pedido · #{order.id.slice(-8)}
              </p>
              <CardTitle className="font-display italic text-3xl leading-[1.1] tracking-[var(--ls-tight)] text-[var(--text-primary)] truncate">
                {order.customer.name}
              </CardTitle>
              <div className="text-sm text-[var(--text-tertiary)] mt-1.5 flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
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
                    <span className="font-bold text-[var(--text-secondary)]">
                      {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Total
            </p>
            <p className="font-display italic text-3xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
              S/{order.total.toFixed(2)}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors mt-1"
              aria-label="Cerrar panel"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </header>

        {/* ─── 2. ACTION BANNER — siempre visible, no scrollea ───────────── */}
        {actionBanner && (
          <section
            className={cn(
              "shrink-0 px-7 py-4 border-b flex items-center gap-4",
              "bg-[var(--surface-sunken)] border-[var(--rule-soft)]",
            )}
            aria-label="Acción primaria"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Siguiente paso
              </p>
              <p className="text-sm font-extrabold text-[var(--text-primary)] mt-0.5 truncate">
                {actionBanner.label}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                {actionBanner.sub}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actionBanner.secondary && (
                <button
                  type="button"
                  onClick={actionBanner.secondary.onClick}
                  className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-extrabold border-2 border-[var(--data-error)]/30 text-[var(--data-error)] bg-[var(--data-error)]/5 hover:bg-[var(--data-error)]/10 transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                  {actionBanner.secondary.label}
                </button>
              )}
              <button
                type="button"
                onClick={actionBanner.primary.onClick}
                className={cn(
                  "inline-flex items-center gap-1.5 h-11 px-5 rounded-xl text-sm font-extrabold uppercase tracking-wider transition-colors text-white",
                  actionBanner.primary.tone === "success"
                    ? "bg-[var(--data-success)] hover:opacity-90"
                    : "bg-[var(--text-primary)] hover:bg-[var(--accent)]",
                )}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
                {actionBanner.primary.label}
              </button>
            </div>
          </section>
        )}

        {/* ─── SCROLLABLE BODY ──────────────────────────────────────────── */}
        <div className="overflow-y-auto px-7 py-6 space-y-6 flex-1 bg-[var(--surface-canvas)]">
          {/* ─── 3. ITEMS + RESUMEN ──────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <SectionTitle className="text-base font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Productos
              </SectionTitle>
              <span className="text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
                {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
              </span>
            </div>
            <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
              <ul className="divide-y divide-[var(--rule-soft)]">
                {order.items.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        <span className="text-[var(--accent)] font-black tabular-nums mr-1">
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
                    <p className="font-bold tabular-nums text-[var(--text-primary)] shrink-0">
                      S/{(item.price * item.quantity).toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
              {/* Resumen */}
              <div className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/40">
                {((order.couponDiscount ?? 0) > 0 || (order.discountAmount ?? 0) > 0) && (
                  <>
                    <div className="flex justify-between items-center px-4 py-2 text-sm">
                      <span className="text-[var(--text-secondary)]">Subtotal</span>
                      <span className="text-[var(--text-secondary)] tabular-nums">S/{subtotal.toFixed(2)}</span>
                    </div>
                    {(order.discountAmount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-4 py-2 text-sm">
                        <span className="text-[var(--data-success)] font-bold">
                          Descuento{order.appliedPromoId ? ` · ${order.appliedPromoId}` : ""}
                        </span>
                        <span className="font-bold text-[var(--data-success)] tabular-nums">
                          −S/{Number(order.discountAmount).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {(order.couponDiscount ?? 0) > 0 && (
                      <div className="flex justify-between items-center px-4 py-2 text-sm">
                        <span className="text-[var(--data-success)] font-bold">
                          Cupón{order.appliedCouponCode ? ` · ${order.appliedCouponCode}` : ""}
                        </span>
                        <span className="font-bold text-[var(--data-success)] tabular-nums">
                          −S/{Number(order.couponDiscount).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--rule-soft)]">
                  <span className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Total a cobrar
                  </span>
                  <span className="font-display italic font-extrabold text-2xl tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                    S/{order.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ─── 4. CONTACTO + DIRECCIÓN ─────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle className="text-base font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Contacto · Entrega
            </SectionTitle>
            <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
              {/* Teléfono */}
              {phone && (
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--rule-soft)]">
                  <Phone className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} />
                  <span className="font-mono text-sm font-bold text-[var(--text-primary)] flex-1 truncate">
                    {phone}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`tel:${phoneDigits}`}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" /> Llamar
                    </a>
                    <a
                      href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hola ${order.customer.name}, sobre tu pedido #${order.id.slice(-8)}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-[var(--data-success)]/10 border border-[var(--data-success)]/30 text-xs font-bold text-[var(--data-success)] hover:bg-[var(--data-success)]/15 transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {/* Dirección */}
              <div className="flex items-start gap-3 px-4 py-3">
                <MapPinIcon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
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
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Mapa
                </a>
              </div>

              {/* Notas del cliente — inline si existen */}
              {order.notes && (
                <div className="px-4 py-3 border-t border-[var(--rule-soft)] bg-[var(--accent-soft)]/30">
                  <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
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
            <section className="space-y-3">
              <SectionTitle className="text-base font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Pago
              </SectionTitle>
              <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-center gap-3 flex-wrap">
                <span
                  className={cn(
                    "inline-flex px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider",
                    order.paymentMethod === "yape"
                      ? "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)]"
                      : "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30",
                  )}
                >
                  {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                </span>
                {order.yapeOperationNumber && (
                  <span className="font-mono text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                    Nº Op. {order.yapeOperationNumber}
                  </span>
                )}
                {order.paymentMethod === "efectivo" && order.deuda && (
                  <>
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-extrabold bg-[var(--data-error)]/10 text-[var(--data-error)] border border-[var(--data-error)]/30">
                      Deuda pendiente
                    </span>
                    <button
                      type="button"
                      onClick={() => onMarkDeudaPaid(order.id)}
                      className="ml-auto inline-flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-extrabold text-[var(--data-success)] bg-[var(--data-success)]/10 hover:bg-[var(--data-success)]/15 border border-[var(--data-success)]/30 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" /> Marcar cobrado
                    </button>
                  </>
                )}
                {order.paymentMethod === "efectivo" && order.deuda === false && (
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-extrabold bg-[var(--data-success)]/10 text-[var(--data-success)] border border-[var(--data-success)]/30">
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
              className="w-full flex items-center justify-between gap-2 py-2 group"
              aria-expanded={notesOpen}
            >
              <div className="flex items-center gap-2">
                {notesOpen ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                )}
                <SectionTitle className="text-base font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors">
                  Notas internas
                </SectionTitle>
                {adminNotes && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[var(--data-warning)]/15 text-[var(--data-warning)] text-xs font-extrabold">
                    !
                  </span>
                )}
              </div>
            </button>
            {notesOpen && (
              <div className="space-y-3 mt-2">
                {adminNotes && (
                  <div className="rounded-xl bg-[var(--data-warning)]/10 border border-[var(--data-warning)]/30 p-4">
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
                    placeholder="Agregar nota (sólo equipo)…"
                    className="flex-1 h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => onSaveAdminNote(order.id)}
                    disabled={savingNote || !adminNote.trim()}
                    className="h-12 px-4 rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-extrabold hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
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
              <SectionTitle className="text-base font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors">
                Línea de tiempo
              </SectionTitle>
            </button>
            {timelineOpen && (
              <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 mt-2">
                <ol className="relative pl-6">
                  <span
                    aria-hidden
                    className="absolute left-2.5 top-3 bottom-3 w-px bg-[var(--rule-base)]"
                  />
                  {getOrderTimeline(order).map((step) => {
                    const Icon = step.icon;
                    const isCanceled = step.status === "cancelado";
                    return (
                      <li key={step.status} className="relative pb-4 last:pb-0">
                        <span
                          className={cn(
                            "absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 shrink-0",
                            step.completed || step.current
                              ? isCanceled
                                ? "bg-[var(--data-error)] border-[var(--data-error)] text-white"
                                : "bg-[var(--data-success)] border-[var(--data-success)] text-white"
                              : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-tertiary)]",
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-extrabold",
                              step.completed || step.current
                                ? isCanceled
                                  ? "text-[var(--data-error)]"
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

        {/* ─── 9. FOOTER STICKY — acciones secundarias ───────────────────── */}
        <footer className="shrink-0 px-7 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] flex items-center gap-2 flex-wrap">
          {order.status !== "cancelado" && order.status !== "entregado" && (
            <button
              type="button"
              onClick={() => onShowRejectModal(order.id)}
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-bold text-[var(--data-error)] border-2 border-[var(--data-error)]/30 bg-[var(--data-error)]/5 hover:bg-[var(--data-error)]/10 transition-colors"
            >
              <X className="h-4 w-4" />
              Rechazar
            </button>
          )}
          <button
            type="button"
            onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-bold text-[var(--text-secondary)] border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer")}
            className="ml-auto inline-flex items-center gap-1.5 h-11 px-5 rounded-xl text-sm font-extrabold uppercase tracking-wider bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)] transition-colors"
          >
            <FileText className="h-4 w-4" strokeWidth={2.5} />
            Generar boleta
          </button>
        </footer>
      </div>
    </div>
  );
}
