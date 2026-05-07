"use client";

/**
 * PendingOrdersModal — modal de pedidos pendientes de una tienda.
 *
 * Se abre desde el badge "X pendientes" en TenantCard. Lista los pedidos
 * sin entregar (pendiente / preparando / asignado / en_camino), con todos
 * los datos para que el superadmin pueda llamar/avisar a la tienda.
 *
 * Acciones rápidas por pedido:
 *   - WhatsApp al cliente
 *   - Llamar al cliente
 *   - WhatsApp al dueño de la tienda (botón en el header)
 *
 * Diseño: drawer derecho de ancho ~640px en desktop, fullscreen en mobile.
 * Tokens DS, sin emojis, jerarquía clara.
 */

import { useEffect, useState } from "react";
import {
  Loader2, X, AlertTriangle, ShoppingBag, Clock, MapPin,
  Phone, Wallet, Truck, ChevronRight,
} from "lucide-react";

interface Item {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string | null;
  image: string | null;
}

interface DeliveryInfo {
  status: string;
  partnerName: string | null;
  partnerPhone: string | null;
  vehicleType?: string | null;
  pickedUpAt?: string | null;
  distanceKm?: number;
  fee?: number;
  expiresAt?: string;
  attempt?: number;
}

interface PendingOrder {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string | null;
  customerReference: string | null;
  total: number;
  status: string;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  minutesWaiting: number;
  itemsCount: number;
  items: Item[];
  delivery: DeliveryInfo | null;
}

interface ApiResponse {
  tenant: { slug: string; name: string; ownerPhone: string | null; ownerEmail: string | null };
  orders: PendingOrder[];
  stats: { total: number; oldestMinutes: number; sumTotal: number };
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  preparando: "Preparando",
  asignado: "Asignado",
  en_camino: "En camino",
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  pendiente: { bg: "bg-amber-100 dark:bg-amber-950/40", fg: "text-[var(--data-warning-700)] dark:text-amber-300" },
  preparando: { bg: "bg-blue-100 dark:bg-blue-950/40", fg: "text-blue-700 dark:text-blue-300" },
  asignado: { bg: "bg-teal-100 dark:bg-teal-950/40", fg: "text-[var(--accent-dark)] dark:text-teal-300" },
  en_camino: { bg: "bg-indigo-100 dark:bg-indigo-950/40", fg: "text-[color:var(--brand-info)]" },
};

function fmtMins(m: number): string {
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h}h ${m % 60}m`;
}

export function PendingOrdersModal({
  tenantSlug,
  tenantName,
  onClose,
}: {
  tenantSlug: string;
  tenantName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/superadmin/tenants/${tenantSlug}/pending-orders`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: ApiResponse) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Esc para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-orders-title"
      className="fixed inset-0 z-[60] flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />
      <aside
        className="relative w-full max-w-2xl bg-[var(--surface-canvas)] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 px-6 py-5 bg-[var(--surface-canvas)]/95 backdrop-blur border-b border-[var(--rule-base)]">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--accent)]">
                Pedidos pendientes
              </p>
              <h2 id="pending-orders-title" className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">
                {tenantName}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="h-9 w-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stats + acción al dueño */}
          {data && (
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-extrabold text-[var(--text-primary)]">
                  {data.stats.total} pedido{data.stats.total === 1 ? "" : "s"}
                </span>
                <span className="text-[var(--text-tertiary)]">·</span>
                <span className="text-[var(--text-secondary)]">
                  Total S/ {data.stats.sumTotal.toFixed(2)}
                </span>
                {data.stats.oldestMinutes > 30 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-danger,#ef4444)]">
                    <Clock className="h-3 w-3" />
                    +{data.stats.oldestMinutes} min sin atender
                  </span>
                )}
              </div>
              {data.tenant.ownerPhone && (
                <a
                  href={`https://wa.me/51${data.tenant.ownerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                    `Hola, somos Buleje. Tienes ${data.stats.total} pedido(s) pendiente(s). ¿Necesitas ayuda?`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[var(--data-success-500)] text-white text-xs font-bold hover:bg-[var(--data-success-600)] transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Avisar al dueño
                </a>
              )}
            </div>
          )}
        </header>

        <div className="px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[var(--brand-danger,#ef4444)]/30 bg-[var(--brand-danger,#ef4444)]/5 px-4 py-3 text-sm font-bold text-[var(--brand-danger,#ef4444)] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {data && data.orders.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <p className="mt-3 text-base font-bold text-[var(--text-primary)]">
                Sin pedidos pendientes
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Esta tienda está al día con sus entregas.
              </p>
            </div>
          )}

          {data && data.orders.length > 0 && (
            <ul className="space-y-3">
              {data.orders.map((o) => {
                const tone = STATUS_TONE[o.status] ?? { bg: "bg-gray-100", fg: "text-gray-700" };
                const isExpanded = expandedOrder === o.id;
                const isOld = o.minutesWaiting > 30;
                return (
                  <li
                    key={o.id}
                    className={`rounded-2xl border-2 ${
                      isOld
                        ? "border-[var(--brand-danger,#ef4444)]/40 bg-[var(--brand-danger,#ef4444)]/5"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
                    } overflow-hidden`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedOrder(isExpanded ? null : o.id)}
                      className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-[var(--surface-sunken)]/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`inline-flex items-center h-6 px-2 rounded-md text-xs font-bold uppercase tracking-wider ${tone.bg} ${tone.fg}`}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </span>
                          <span className="text-xs font-mono text-[var(--text-tertiary)]">
                            #{o.id.slice(-8)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-bold ${
                              isOld ? "text-[var(--brand-danger,#ef4444)]" : "text-[var(--text-tertiary)]"
                            }`}
                          >
                            <Clock className="h-3 w-3" />
                            {fmtMins(o.minutesWaiting)}
                          </span>
                        </div>
                        <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                          {o.customerName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)] mt-0.5">
                          {o.customerPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {o.customerPhone}
                            </span>
                          )}
                          {o.customerLocation && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <MapPin className="h-3 w-3" />
                              {o.customerLocation}
                            </span>
                          )}
                          <span className="flex items-center gap-1 font-bold text-[var(--text-primary)]">
                            <Wallet className="h-3 w-3" />
                            S/ {o.total.toFixed(2)}
                          </span>
                          <span className="text-[var(--text-tertiary)]">
                            {o.itemsCount} ítem{o.itemsCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform shrink-0 mt-1 ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 space-y-4 border-t border-[var(--rule-base)]">
                        {/* Items */}
                        <div>
                          <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                            Productos
                          </p>
                          <ul className="space-y-1.5">
                            {o.items.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center gap-3 text-sm rounded-lg bg-[var(--surface-sunken)] px-3 py-2"
                              >
                                <span className="flex-1 font-bold text-[var(--text-primary)] truncate">
                                  {item.name}
                                </span>
                                <span className="text-[var(--text-tertiary)] tabular-nums">
                                  {item.quantity} {item.unit ?? ""}
                                </span>
                                <span className="font-extrabold text-[var(--text-primary)] tabular-nums w-20 text-right">
                                  S/ {(item.price * item.quantity).toFixed(2)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Notas + referencia */}
                        {(o.notes || o.customerReference) && (
                          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs">
                            {o.customerReference && (
                              <p className="text-[var(--text-secondary)]">
                                <span className="font-bold text-[var(--text-primary)]">Referencia:</span>{" "}
                                {o.customerReference}
                              </p>
                            )}
                            {o.notes && (
                              <p className="text-[var(--text-secondary)] mt-0.5">
                                <span className="font-bold text-[var(--text-primary)]">Notas:</span>{" "}
                                {o.notes}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Delivery info */}
                        {o.delivery && (
                          <div className="rounded-lg bg-[var(--accent-soft,rgba(0,180,166,0.1))] px-3 py-2 text-xs">
                            <p className="font-bold text-[var(--accent)] uppercase tracking-wider mb-1 flex items-center gap-1">
                              <Truck className="h-3 w-3" />
                              {o.delivery.status === "ofertando" ? "Ofreciendo a repartidor" : "Repartidor"}
                            </p>
                            <p className="text-[var(--text-primary)]">
                              <span className="font-bold">{o.delivery.partnerName}</span>
                              {o.delivery.partnerPhone && (
                                <span className="text-[var(--text-tertiary)]"> · {o.delivery.partnerPhone}</span>
                              )}
                              {o.delivery.distanceKm !== undefined && (
                                <span className="text-[var(--text-tertiary)]"> · {o.delivery.distanceKm.toFixed(1)} km</span>
                              )}
                              {o.delivery.fee !== undefined && (
                                <span className="text-[var(--text-tertiary)]"> · S/ {o.delivery.fee.toFixed(2)}</span>
                              )}
                            </p>
                          </div>
                        )}

                        {/* Acciones */}
                        <div className="flex flex-wrap gap-2">
                          {o.customerPhone && (
                            <>
                              <a
                                href={`tel:${o.customerPhone}`}
                                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                Llamar
                              </a>
                              <a
                                href={`https://wa.me/51${o.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                  `Hola ${o.customerName}, te escribimos por tu pedido #${o.id.slice(-8)} en ${tenantName}.`,
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--data-success-500)] text-white text-xs font-bold hover:bg-[var(--data-success-600)]"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                WhatsApp cliente
                              </a>
                            </>
                          )}
                          {o.customerLocation && (
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(o.customerLocation)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              Maps
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
