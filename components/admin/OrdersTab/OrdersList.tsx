"use client";

/**
 * OrdersList — Lista de pedidos activos rediseñada en estilo Holded.
 *
 * Patron card:
 *   - Borde izquierdo accent que indica urgencia (rojo +2h, amber +1h, normal)
 *   - Avatar inicial customer + status pill tokenizada + payment chip
 *   - Stats inline: distancia (si hay GPS), tiempo, items, total resaltado
 *   - Acciones agrupadas a la derecha: Yape verify/reject, Marcar pagado,
 *     Maps, status select, delete (con tooltips)
 *   - Selección bulk con checkbox a la izquierda
 *   - Hover translate-y sutil + ring accent on selected
 *
 * Sin `bg-gray-100 dark:bg-card` legacy — solo tokens Buleje.
 */

import { useMemo } from "react";
import { Check, X, MapPin, Trash2, Bike, ShoppingBasket, Clock, Package, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/admin/EmptyState";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { formatDate, parseGps, haversineKm } from "@/lib/admin-helpers";
import { googleMapsUrl } from "@/lib/order-utils";
import { STATUS_LABELS, VALID_TRANSITIONS, ORD_PER_PAGE } from "./types";

interface OrdersListProps {
  activeOrders: DbOrder[];
  loading: boolean;
  storeLat: number | null;
  storeLon: number | null;
  selectedOrderIds: Set<string>;
  ordPage: number;
  driverColor: (name: string) => string;
  onSelectOrder: (order: DbOrder) => void;
  onToggleSelect: (id: string) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onMarkDeudaPaid: (id: string) => void;
  onDeleteOrder: (id: string) => void;
  onPageChange: (page: number) => void;
}

// ── Status pills tokenizadas ──────────────────────────────────────────────
const STATUS_STYLES: Record<OrderStatus, string> = {
  pendiente: "bg-[var(--data-warning)]/10 text-[var(--data-warning)] border-[var(--data-warning)]/25",
  confirmado: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30",
  en_camino: "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-[var(--text-primary)]",
  entregado: "bg-[var(--data-success)]/10 text-[var(--data-success)] border-[var(--data-success)]/30",
  cancelado: "bg-[var(--data-error)]/10 text-[var(--data-error)] border-[var(--data-error)]/30",
};

export function OrdersList({
  activeOrders,
  loading,
  storeLat,
  storeLon,
  selectedOrderIds,
  ordPage,
  driverColor,
  onSelectOrder,
  onToggleSelect,
  onUpdateStatus,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
  onDeleteOrder,
  onPageChange,
}: OrdersListProps) {
  const ordTotalPages = Math.max(1, Math.ceil(activeOrders.length / ORD_PER_PAGE));
  const safeOrdPage = Math.min(ordPage, ordTotalPages);
  const paginatedOrders = activeOrders.slice(
    (safeOrdPage - 1) * ORD_PER_PAGE,
    safeOrdPage * ORD_PER_PAGE,
  );

  // eslint-disable-next-line react-hooks/purity -- Date.now() es intencional para urgencia
  const nowMs = useMemo(() => Date.now(), []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 flex items-center gap-4"
          >
            <div className="h-5 w-5 skeleton-shimmer rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 skeleton-shimmer rounded w-1/4" />
              <div className="h-3 skeleton-shimmer rounded w-1/2" />
            </div>
            <div className="h-6 w-20 skeleton-shimmer rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (activeOrders.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBasket className="h-10 w-10 text-[var(--text-tertiary)]" />}
        title="No hay pedidos activos"
        description="Los pedidos nuevos aparecerán aquí en tiempo real."
        actions={[{ label: "Ver todos los pedidos", href: "/admin?tab=pedidos", variant: "secondary" }]}
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {paginatedOrders.map((o) => {
          const orderAgeMs = nowMs - new Date(o.createdAt).getTime();
          const orderAgeHours = orderAgeMs / (1000 * 60 * 60);
          const isUrgent2h = orderAgeHours >= 2;
          const isUrgent1h = !isUrgent2h && orderAgeHours >= 1;
          const urgencyBorderClass = isUrgent2h
            ? "border-l-4 border-l-[var(--data-error)]"
            : isUrgent1h
              ? "border-l-4 border-l-[var(--data-warning)]"
              : "border-l-4 border-l-transparent";
          const driver = (o as DbOrder & { deliveryDriver?: string }).deliveryDriver;
          const initial = o.customer.name.trim().charAt(0).toUpperCase() || "?";
          const isSelected = selectedOrderIds.has(o.id);

          return (
            <article
              key={o.id}
              className={cn(
                "rounded-xl border bg-[var(--surface-raised)] overflow-hidden transition-all duration-200",
                urgencyBorderClass,
                isSelected
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                  : "border-[var(--rule-soft)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                "motion-reduce:hover:translate-y-0",
              )}
            >
              <div
                className="p-4 flex flex-col lg:flex-row lg:items-center gap-4 cursor-pointer"
                onClick={() => onSelectOrder(o)}
              >
                {/* Bulk checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleSelect(o.id)}
                  aria-label={`Seleccionar pedido de ${o.customer.name}`}
                  className="rounded border-[var(--rule-base)] text-[var(--accent)] focus:ring-[var(--accent)]/30 shrink-0 self-start mt-1"
                />

                {/* Avatar inicial */}
                <span
                  aria-hidden
                  className="hidden sm:inline-flex h-12 w-12 items-center justify-center rounded-xl shrink-0 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-lg font-black tracking-tight self-start"
                >
                  {initial}
                </span>

                {/* Customer info */}
                <div className="flex-1 min-w-0">
                  {/* Top row: nombre + teléfono + status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[var(--text-primary)] text-base">
                      {o.customer.name}
                    </span>
                    {o.customer.phone && (
                      <span className="text-sm font-mono text-[var(--text-tertiary)]">
                        {o.customer.phone}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border",
                        STATUS_STYLES[o.status],
                      )}
                    >
                      {STATUS_LABELS[o.status]}
                    </span>
                    {isUrgent2h && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[var(--data-error)] text-white animate-pulse">
                        <AlertTriangle className="h-3 w-3" strokeWidth={2.5} aria-hidden /> +2h
                      </span>
                    )}
                    {isUrgent1h && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[var(--data-warning)] text-white">
                        <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden /> +1h
                      </span>
                    )}
                    {o.paymentMethod && (
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border",
                          o.paymentMethod === "yape"
                            ? "bg-[var(--surface-sunken)] text-[var(--text-primary)] border-[var(--rule-base)]"
                            : "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/25",
                        )}
                      >
                        {o.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                      </span>
                    )}
                    {o.paymentMethod === "efectivo" && o.deuda && (
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-[var(--data-error)]/10 text-[var(--data-error)] border border-[var(--data-error)]/30">
                        Deuda pendiente
                      </span>
                    )}
                    {driver && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: driverColor(driver) }}
                      >
                        <Bike className="h-3 w-3" strokeWidth={2} aria-hidden /> {driver}
                      </span>
                    )}
                  </div>

                  {/* Address line */}
                  <p className="mt-1.5 text-[length:var(--ts-sm)] text-[var(--text-secondary)] truncate">
                    {o.customer.location}
                  </p>

                  {/* Bottom stats inline: distance + time + items + total */}
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-[var(--text-tertiary)]">
                    {storeLat !== null && storeLon !== null && (() => {
                      const gps = parseGps(o.customer.location);
                      if (!gps) return null;
                      const km = haversineKm(storeLat, storeLon, gps.lat, gps.lon);
                      const label = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
                      return (
                        <span className="inline-flex items-center gap-1 font-bold text-[var(--accent)]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                          {label}
                        </span>
                      );
                    })()}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      {formatDate(o.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      {o.items.length} {o.items.length === 1 ? "producto" : "productos"}
                    </span>
                    <span className="inline-flex items-center gap-1 ml-auto sm:ml-0 font-black tabular-nums text-[var(--text-primary)] text-base">
                      S/{o.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Right: actions */}
                <div
                  className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {o.paymentMethod === "yape" && o.status === "pendiente" && (
                    <>
                      <button
                        type="button"
                        onClick={() => onVerifyYape(o.id)}
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-sm font-bold text-[var(--data-success)] bg-[var(--data-success)]/10 hover:bg-[var(--data-success)]/15 transition-colors border border-[var(--data-success)]/30"
                        title="Confirmar Yape como valido"
                      >
                        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectYape(o.id)}
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-sm font-bold text-[var(--data-error)] bg-[var(--data-error)]/5 hover:bg-[var(--data-error)]/10 transition-colors border border-[var(--data-error)]/30"
                        title="Rechazar Yape (pago falso)"
                      >
                        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Falso
                      </button>
                    </>
                  )}
                  {o.paymentMethod === "efectivo" && o.deuda && (
                    <button
                      type="button"
                      onClick={() => onMarkDeudaPaid(o.id)}
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-sm font-bold text-[var(--data-success)] bg-[var(--data-success)]/10 hover:bg-[var(--data-success)]/15 transition-colors border border-[var(--data-success)]/30"
                      title="Marcar deuda como cobrada"
                    >
                      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Cobrado
                    </button>
                  )}
                  <a
                    href={googleMapsUrl(o.customer.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                    title="Ver en Google Maps"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </a>
                  <select
                    value={o.status}
                    onChange={(e) => onUpdateStatus(o.id, e.target.value as OrderStatus)}
                    className="text-sm font-bold rounded-lg border border-[var(--rule-base)] px-2.5 h-9 outline-none focus:border-[var(--accent)] text-[var(--text-primary)] bg-[var(--surface-raised)] cursor-pointer"
                    disabled={!VALID_TRANSITIONS[o.status]?.length}
                    aria-label="Cambiar estado del pedido"
                  >
                    <option value={o.status}>{STATUS_LABELS[o.status]}</option>
                    {(VALID_TRANSITIONS[o.status] ?? []).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onDeleteOrder(o.id)}
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error)]/10 transition-colors"
                    title="Eliminar"
                    aria-label="Eliminar pedido"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination tokenizada */}
      {activeOrders.length > ORD_PER_PAGE && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            type="button"
            disabled={safeOrdPage <= 1}
            onClick={() => onPageChange(Math.max(1, safeOrdPage - 1))}
            className="h-9 px-4 rounded-lg text-sm font-bold border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] disabled:opacity-40 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
          >
            Anterior
          </button>
          <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
            Pagina <strong className="text-[var(--text-primary)] font-bold">{safeOrdPage}</strong> de{" "}
            <strong className="text-[var(--text-primary)] font-bold">{ordTotalPages}</strong> ·{" "}
            {activeOrders.length} pedidos
          </span>
          <button
            type="button"
            disabled={safeOrdPage >= ordTotalPages}
            onClick={() => onPageChange(safeOrdPage + 1)}
            className="h-9 px-4 rounded-lg text-sm font-bold border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] disabled:opacity-40 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
          >
            Siguiente
          </button>
        </div>
      )}
    </>
  );
}
