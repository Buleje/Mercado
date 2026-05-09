"use client";

/**
 * OrderDetailDrawer — modal centrado para ver y gestionar un pedido.
 *
 * Layout: dialog centrado (max-w-4xl), 2 columnas en desktop:
 *   - Izquierda: cliente + productos + breakdown
 *   - Derecha: mapa + asignar delivery
 *
 * 100% tokens del DS Buleje, sin emojis ni colores hardcoded.
 */

import { useEffect, useState, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import dynamic from "next/dynamic";
import {
  X, ShoppingCart, User, Phone, MessageSquare, MapPin, Package,
  Bike, Loader2, Printer, AlertTriangle, Check, Star, Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MarketplaceOrder } from "./types";

// Mapa lazy — Leaflet no debe cargarse hasta que se abra el drawer
const OrderMiniMap = dynamic(() => import("./OrderMiniMap"), {
  ssr: false,
  loading: () => (
    <div className="h-48 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center text-sm text-[var(--text-tertiary)]">
      Cargando mapa…
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string | null;
  image: string | null;
}

interface OrderFullDto {
  id: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string;
  customerReference: string;
  total: number;
  couponDiscount: number | null;
  discountAmount: number | null;
  createdAt: string;
  items: OrderItem[];
  /** Coords opcionales del cliente (si se capturaron en checkout). */
  customerLat?: number | null;
  customerLng?: number | null;
}

interface DeliveryPartner {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string | null;
  isOnline: boolean;
  rating: number | null;
  currentOrderId: string | null;
  lat: number | null;
  lng: number | null;
}

const STATUS_TONE: Record<string, string> = {
  pendiente:  "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] border-[var(--data-warning-500)]/35",
  confirmado: "bg-[var(--data-info-50)] text-[var(--data-info-700)] border-[var(--data-info-500)]/35",
  preparando: "bg-[var(--accent-soft)] text-[var(--accent-dark)] border-[var(--accent)]/35",
  en_camino:  "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] border-[var(--data-warning-500)]/35",
  entregado:  "bg-[var(--data-success-50)] text-[var(--data-success-700)] border-[var(--data-success-500)]/35",
  cancelado:  "bg-[var(--data-error-50)] text-[var(--data-error-700)] border-[var(--data-error-500)]/35",
};

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return `S/${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("51") || digits.length > 10 ? digits : `51${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface OrderDetailDrawerProps {
  order: MarketplaceOrder;
  onClose: () => void;
  onStatusChanged: (orderId: string, newStatus: string) => void;
}

export default function OrderDetailDrawer({
  order: orderSeed,
  onClose,
  onStatusChanged,
}: OrderDetailDrawerProps) {
  const [order, setOrder] = useState<OrderFullDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  // Cargar detalle de la orden
  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/marketplace/orders/${orderSeed.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error("No se pudo cargar el pedido");
      const json = await r.json();
      setOrder(json.data as OrderFullDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [orderSeed.id]);

  // Cargar partners online
  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    try {
      const r = await fetch("/api/admin/delivery/partners-live", {
        credentials: "include",
        cache: "no-store",
      });
      if (r.ok) {
        const json = await r.json();
        setPartners((json.partners ?? json.data ?? []) as DeliveryPartner[]);
      }
    } catch {
      // silencioso — la sección queda vacía
    } finally {
      setLoadingPartners(false);
    }
  }, []);

  useEffect(() => {
    void loadOrder();
    void loadPartners();
  }, [loadOrder, loadPartners]);

  // Asignar partner manualmente
  const assignPartner = useCallback(
    async (partnerId: string) => {
      setAssigning(partnerId);
      setError(null);
      try {
        const r = await fetch("/api/admin/delivery/manual-assign", {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ orderId: orderSeed.id, partnerId }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? "No se pudo asignar");
        }
        const partner = partners.find((p) => p.id === partnerId);
        setAssignSuccess(`Asignado a ${partner?.name ?? "repartidor"}`);
        setTimeout(() => setAssignSuccess(null), 3000);
        await loadPartners();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al asignar");
      } finally {
        setAssigning(null);
      }
    },
    [orderSeed.id, partners, loadPartners],
  );

  // Cancelar orden
  const cancelOrder = useCallback(async () => {
    const reason = prompt("Motivo de cancelación (opcional):") ?? "";
    if (reason === null) return;
    try {
      const r = await fetch(`/api/marketplace/orders/${orderSeed.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "cancelado", cancelReason: reason }),
      });
      if (!r.ok) throw new Error("No se pudo cancelar");
      onStatusChanged(orderSeed.id, "cancelado");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar");
    }
  }, [orderSeed.id, onStatusChanged, onClose]);

  // ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const subtotal = order
    ? order.items.reduce((s, i) => s + i.price * i.quantity, 0)
    : 0;
  const discount = order ? (order.discountAmount ?? 0) + (order.couponDiscount ?? 0) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-modal-title"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      {/* Modal centrado — max-w-4xl, 2 columnas en desktop */}
      <div
        className="relative w-full max-w-4xl bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)] rounded-3xl shadow-2xl flex flex-col max-h-[calc(100vh-3rem)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-4 bg-[var(--surface-raised)] border-b-2 border-[var(--rule-base)] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
              <ShoppingCart className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Pedido #{orderSeed.id.slice(-8).toUpperCase()}
              </p>
              <h2
                id="order-modal-title"
                className="text-lg sm:text-xl font-black tracking-[-0.02em] text-[var(--text-primary)] truncate leading-tight"
              >
                {orderSeed.customerName}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </header>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Status badge + total chip */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-2 px-3 h-9 rounded-xl border-2 text-sm font-extrabold uppercase tracking-wider",
                STATUS_TONE[orderSeed.status] ?? STATUS_TONE.pendiente,
              )}
            >
              <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
              {STATUS_LABEL[orderSeed.status] ?? orderSeed.status}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-dark)] text-sm font-extrabold font-mono tabular-nums">
              {fmtMoney(orderSeed.total)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Clock className="h-3.5 w-3.5" strokeWidth={2.25} />
              {fmtDate(orderSeed.createdAt)}
            </span>
          </div>

          {error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-4 py-3 text-sm font-bold text-[var(--data-error-700)] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} aria-label="Cerrar">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {assignSuccess && (
            <div className="rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-4 py-3 text-sm font-extrabold text-[var(--data-success-700)] flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
              {assignSuccess}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : !order ? (
            <p className="text-center text-sm text-[var(--text-tertiary)] py-12">
              No se pudo cargar el detalle.
            </p>
          ) : (
            <>
              {/* Cliente */}
              <Section icon={<User className="h-4 w-4" strokeWidth={2.5} />} title="Cliente">
                <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-2.5">
                  <Field label="Nombre" value={order.customerName} bold />
                  {order.customerPhone && (
                    <div className="flex items-center justify-between gap-2">
                      <Field label="Teléfono" value={order.customerPhone} mono />
                      <a
                        href={buildWhatsAppUrl(
                          order.customerPhone,
                          `Hola ${order.customerName}, te escribimos por tu pedido #${order.id.slice(-8).toUpperCase()}.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#25D366] text-white text-xs font-extrabold uppercase tracking-wide hover:brightness-110 transition shrink-0"
                      >
                        <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.5} /> WhatsApp
                      </a>
                    </div>
                  )}
                  {orderSeed.customerLocation && (
                    <Field label="Dirección" value={orderSeed.customerLocation} />
                  )}
                  {orderSeed.customerReference && (
                    <Field label="Referencia" value={orderSeed.customerReference} muted />
                  )}
                </div>
              </Section>

              {/* Mapa */}
              {(order.customerLat != null && order.customerLng != null) ||
              orderSeed.customerLocation ? (
                <Section
                  icon={<MapPin className="h-4 w-4" strokeWidth={2.5} />}
                  title="Ubicación"
                >
                  <div className="rounded-2xl border-2 border-[var(--rule-base)] overflow-hidden">
                    <OrderMiniMap
                      lat={order.customerLat ?? null}
                      lng={order.customerLng ?? null}
                      address={orderSeed.customerLocation}
                    />
                  </div>
                </Section>
              ) : null}

              {/* Productos */}
              <Section
                icon={<Package className="h-4 w-4" strokeWidth={2.5} />}
                title={`Productos (${order.items.length})`}
              >
                <div className="space-y-2">
                  {order.items.map((it) => (
                    <article
                      key={it.id}
                      className="flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 hover:border-[var(--accent)]/40 transition-colors"
                    >
                      <div className="h-14 w-14 rounded-lg bg-[var(--surface-sunken)] overflow-hidden shrink-0 flex items-center justify-center">
                        {it.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.image}
                            alt={it.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight truncate">
                          {it.name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {it.quantity} {it.unit ?? "u"} × {fmtMoney(it.price)}
                        </p>
                      </div>
                      <span className="text-sm font-extrabold text-[var(--text-primary)] font-mono tabular-nums whitespace-nowrap">
                        {fmtMoney(it.price * it.quantity)}
                      </span>
                    </article>
                  ))}
                </div>
              </Section>

              {/* Total breakdown */}
              <Section
                icon={<ShoppingCart className="h-4 w-4" strokeWidth={2.5} />}
                title="Resumen"
              >
                <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-2 text-sm">
                  <Row label="Subtotal" value={fmtMoney(subtotal)} />
                  {discount > 0 && (
                    <Row
                      label="Descuento"
                      value={`-${fmtMoney(discount)}`}
                      tone="text-[var(--data-success-700)]"
                    />
                  )}
                  <div className="h-px bg-[var(--rule-base)] my-1" />
                  <Row
                    label="Total"
                    value={fmtMoney(order.total)}
                    bold
                    tone="text-[var(--accent)] text-base"
                  />
                </div>
              </Section>

              {/* Asignar delivery */}
              <Section
                icon={<Bike className="h-4 w-4" strokeWidth={2.5} />}
                title="Asignar repartidor"
              >
                {loadingPartners ? (
                  <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                  </div>
                ) : partners.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
                    <Bike className="h-8 w-8 mx-auto text-[var(--text-tertiary)]" strokeWidth={1.75} />
                    <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">
                      Sin repartidores online
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      Activá los partners de tu app o usá un servicio externo.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {partners.map((p) => {
                      const busy = !!p.currentOrderId && p.currentOrderId !== orderSeed.id;
                      return (
                        <article
                          key={p.id}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border-2 p-3 transition-all",
                            busy
                              ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] opacity-60"
                              : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]",
                          )}
                        >
                          <div
                            className={cn(
                              "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                              p.isOnline
                                ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]"
                                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                            )}
                          >
                            <Bike className="h-5 w-5" strokeWidth={2.25} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                                {p.name}
                              </p>
                              {p.isOnline && (
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)] animate-pulse" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-0.5">
                              {p.vehicleType && <span>{p.vehicleType}</span>}
                              {p.rating != null && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Star className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                                  {p.rating.toFixed(1)}
                                </span>
                              )}
                              {busy && (
                                <span className="text-[var(--data-warning-700)] font-bold">
                                  · ocupado
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => assignPartner(p.id)}
                            disabled={busy || assigning === p.id}
                            className={cn(
                              "inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wide transition-colors shrink-0",
                              busy
                                ? "bg-[var(--rule-base)] text-[var(--text-tertiary)] cursor-not-allowed"
                                : "bg-[var(--accent-600,var(--accent))] text-white hover:bg-[var(--accent-dark)]",
                            )}
                          >
                            {assigning === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Asignar"
                            )}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* Footer sticky con acciones */}
        <footer className="px-6 py-3 bg-[var(--surface-raised)] border-t-2 border-[var(--rule-base)] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border-2 border-[var(--rule-base)] text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Printer className="h-4 w-4" strokeWidth={2.5} /> Imprimir
          </button>
          <button
            type="button"
            onClick={cancelOrder}
            disabled={orderSeed.status === "cancelado" || orderSeed.status === "entregado"}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-xs font-extrabold uppercase tracking-wider text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" strokeWidth={2.5} /> Cancelar pedido
          </button>
          <div className="ml-auto" />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-6 rounded-xl bg-[var(--accent-600,var(--accent))] text-white text-xs font-extrabold uppercase tracking-wider hover:bg-[var(--accent-dark)] transition-colors shadow-sm shadow-[var(--accent)]/30"
          >
            Listo
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  bold,
  muted,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p
        className={cn(
          "text-sm leading-tight mt-0.5",
          bold ? "font-extrabold" : "font-medium",
          muted ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
          mono ? "font-mono" : "",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-[var(--text-secondary)]", bold ? "font-extrabold text-[var(--text-primary)]" : "font-medium")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          bold ? "font-extrabold" : "font-bold",
          tone ?? "text-[var(--text-primary)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
