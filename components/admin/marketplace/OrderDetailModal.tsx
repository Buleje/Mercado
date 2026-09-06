"use client";

/**
 * Modal de detalle de orden del marketplace.
 *
 * Brandon mayo 2026 v7 (Nivel B): el admin puede ver todos los productos,
 * subtotales, dirección completa, comprobante, descuentos y motivo de
 * cancelación sin salir de la tabla. Cierra con ESC o click fuera.
 *
 * Diseño v2 (2026-05-16): rediseño completo con tokens BSM correctos
 * (--surface-raised, --rule-base, --accent, --text-primary). Hero con
 * número de orden + estado + total grande. Footer con acciones rápidas.
 */
import { useEffect } from "react";
import {
  X,
  Phone,
  MapPin,
  NotebookText,
  Package,
  Calendar,
  Copy,
  MessageCircle,
  ChevronRight,
  Receipt,
  User,
} from "@buleje/design-system/icons";
import { SectionTitle, CardTitle } from "@buleje/design-system";
import type { MarketplaceOrderDetail } from "./hooks/use-marketplace-orders";
import { cn } from "@/lib/utils";

interface Props {
  order: MarketplaceOrderDetail | null;
  loading?: boolean;
  onClose: () => void;
  onWhatsApp?: (order: MarketplaceOrderDetail) => void;
  onChangeStatus?: (order: MarketplaceOrderDetail) => void;
}

const PEN_FMT = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

const STATUS_META: Record<
  string,
  { label: string; dot: string; chip: string; text: string }
> = {
  pendiente:  { label: "Pendiente",  dot: "bg-[var(--data-warning)]", chip: "bg-[var(--data-warning)]/15 border-[var(--data-warning)]/30", text: "text-[var(--data-warning)]" },
  confirmado: { label: "Confirmado", dot: "bg-[var(--data-success)]", chip: "bg-[var(--data-success)]/15 border-[var(--data-success)]/30", text: "text-[var(--data-success)]" },
  preparando: { label: "Preparando", dot: "bg-[var(--data-info)]",    chip: "bg-[var(--data-info)]/15 border-[var(--data-info)]/30",       text: "text-[var(--data-info)]" },
  en_camino:  { label: "En camino",  dot: "bg-[var(--data-info)]",    chip: "bg-[var(--data-info)]/15 border-[var(--data-info)]/30",       text: "text-[var(--data-info)]" },
  entregado:  { label: "Entregado",  dot: "bg-[var(--data-success)]", chip: "bg-[var(--data-success)]/15 border-[var(--data-success)]/30", text: "text-[var(--data-success)]" },
  cancelado:  { label: "Cancelado",  dot: "bg-[var(--data-error)]",   chip: "bg-[var(--data-error)]/15 border-[var(--data-error)]/30",     text: "text-[var(--data-error)]" },
};

export function OrderDetailModal({ order, loading, onClose, onWhatsApp, onChangeStatus }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!order && !loading) return null;

  const fmtCurrency = (v: number) => PEN_FMT.format(v);
  const subtotal = order?.items.reduce((sum, it) => sum + it.price * it.quantity, 0) ?? 0;
  const statusMeta = order ? STATUS_META[order.status] ?? STATUS_META.pendiente : null;
  const initials = order?.customerName
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") ?? "—";

  const orderShortId = order?.id.slice(-8).toUpperCase() ?? "—";

  function copyId() {
    if (!order) return;
    void navigator.clipboard?.writeText(`#${orderShortId}`);
  }

  function copyPhone() {
    if (!order?.customerPhone) return;
    void navigator.clipboard?.writeText(order.customerPhone);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "relative w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh]",
          "flex flex-col overflow-hidden",
          "bg-[var(--surface-raised)] text-[var(--text-primary)]",
          "rounded-t-3xl sm:rounded-3xl",
          "border-2 border-[var(--rule-base)] shadow-[var(--shadow-xl)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header (sticky, hero) ─────────────────────── */}
        <header className="relative shrink-0 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Pedido marketplace
              </p>
              <div className="mt-1 flex items-center gap-2">
                <SectionTitle as="h2" className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  #{orderShortId}
                </SectionTitle>
                {order && (
                  <button
                    type="button"
                    onClick={copyId}
                    aria-label="Copiar ID"
                    title="Copiar ID"
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {order && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(order.createdAt).toLocaleString("es-PE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </p>
              )}
            </div>

            <button
              onClick={onClose}
              className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] border-2 border-transparent hover:border-[var(--rule-base)] transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Status + total row */}
          {order && statusMeta && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-xs font-extrabold uppercase tracking-wide",
                  statusMeta.chip,
                  statusMeta.text,
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", statusMeta.dot)} />
                {statusMeta.label}
              </span>
              <div className="text-right">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Total</p>
                <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {fmtCurrency(order.total)}
                </p>
              </div>
            </div>
          )}
        </header>

        {/* ── Body (scrollable) ──────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[var(--surface-raised)]">
          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 border-4 border-[var(--rule-base)] border-t-[var(--accent)] rounded-full animate-spin" />
              <p className="mt-3 text-sm font-bold text-[var(--text-secondary)]">
                Cargando detalle…
              </p>
            </div>
          ) : order ? (
            <>
              {/* ── Cliente ────────────────────────────── */}
              <section>
                <CardTitle as="h3" className="mb-3 flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <User className="h-3.5 w-3.5" />
                  Cliente
                </CardTitle>
                <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center text-base font-extrabold">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                        {order.customerName}
                      </p>
                      {order.customerPhone && (
                        <button
                          type="button"
                          onClick={copyPhone}
                          className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors group"
                          title="Click para copiar"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span className="tabular-nums">{order.customerPhone}</span>
                          <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </div>
                  </div>

                  {(order.customerLocation || order.customerReference) && (
                    <div className="mt-3 pt-3 border-t-2 border-[var(--rule-base)] space-y-2">
                      {order.customerLocation && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {order.customerLocation}
                          </p>
                        </div>
                      )}
                      {order.customerReference && (
                        <div className="flex items-start gap-2">
                          <NotebookText className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                          <p className="text-sm italic text-[var(--text-secondary)]">
                            {order.customerReference}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* ── Productos ──────────────────────────── */}
              <section>
                <CardTitle as="h3" className="mb-3 flex items-center justify-between text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <span className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5" />
                    Productos
                  </span>
                  <span className="text-[var(--text-secondary)]">{order.items.length} ítem{order.items.length !== 1 ? "s" : ""}</span>
                </CardTitle>
                <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] overflow-hidden">
                  <ul className="divide-y-2 divide-[var(--rule-base)]">
                    {order.items.map((it) => (
                      <li key={it.id} className="flex items-center gap-3 p-3">
                        {it.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.image}
                            alt={it.name}
                            className="h-14 w-14 shrink-0 rounded-xl object-cover border-2 border-[var(--rule-base)]"
                          />
                        ) : (
                          <div className="h-14 w-14 shrink-0 rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] flex items-center justify-center">
                            <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                            {it.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="inline-flex h-5 items-center rounded-md bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-1.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums">
                              ×{it.quantity}
                            </span>
                            <span className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">
                              {fmtCurrency(it.price)}
                              {it.unit ? ` / ${it.unit}` : ""}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                          {fmtCurrency(it.price * it.quantity)}
                        </p>
                      </li>
                    ))}
                  </ul>

                  {/* Totales */}
                  <div className="bg-[var(--surface-raised)] border-t-2 border-[var(--rule-base)] p-4 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-[var(--text-secondary)]">Subtotal</span>
                      <span className="font-bold tabular-nums text-[var(--text-primary)]">
                        {fmtCurrency(subtotal)}
                      </span>
                    </div>
                    {order.discountAmount ? (
                      <div className="flex justify-between text-sm text-[var(--data-success)]">
                        <span className="font-bold">Descuento</span>
                        <span className="font-bold tabular-nums">−{fmtCurrency(order.discountAmount)}</span>
                      </div>
                    ) : null}
                    {order.couponDiscount ? (
                      <div className="flex justify-between text-sm text-[var(--data-success)]">
                        <span className="font-bold">Cupón</span>
                        <span className="font-bold tabular-nums">−{fmtCurrency(order.couponDiscount)}</span>
                      </div>
                    ) : null}
                    <div className="mt-2 pt-2 border-t-2 border-[var(--rule-base)] flex justify-between items-baseline">
                      <span className="text-sm font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Total</span>
                      <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
                        {fmtCurrency(order.total)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Cancelación si aplica ──────────────── */}
              {order.status === "cancelado" && order.cancelReason && (
                <section className="rounded-2xl border-2 border-rose-400/50 bg-rose-500/10 p-4">
                  <CardTitle as="h3" className="flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--data-error)] mb-2">
                    <Receipt className="h-3.5 w-3.5" />
                    Motivo de cancelación
                  </CardTitle>
                  <p className="text-sm font-semibold text-[var(--data-error)]">
                    {order.cancelReason}
                  </p>
                  {order.cancelledAt && (
                    <p className="mt-1 text-xs font-bold text-[var(--data-error)]">
                      {new Date(order.cancelledAt).toLocaleString("es-PE")}
                    </p>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>

        {/* ── Footer (acciones, sticky bottom) ──────────── */}
        {order && (
          <footer className="shrink-0 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 py-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl text-sm font-extrabold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
            >
              Cerrar
            </button>
            <div className="flex items-center gap-2">
              {onWhatsApp && order.customerPhone && (
                <button
                  type="button"
                  onClick={() => onWhatsApp(order)}
                  className="h-11 px-4 rounded-xl inline-flex items-center gap-2 bg-[var(--data-success)] text-white text-sm font-extrabold hover:opacity-90 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>
              )}
              {onChangeStatus && (
                <button
                  type="button"
                  onClick={() => onChangeStatus(order)}
                  className="h-11 px-4 rounded-xl inline-flex items-center gap-1.5 bg-[var(--accent)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity"
                >
                  Cambiar estado
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
