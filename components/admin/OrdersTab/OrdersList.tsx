"use client";

import { useMemo } from "react";
import { Check, X, MapPin, Trash2, Bike, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/admin/EmptyState";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { formatDate, parseGps, haversineKm } from "@/lib/admin-helpers";
import { googleMapsUrl } from "@/lib/order-utils";
import { STATUS_COLORS, STATUS_LABELS, VALID_TRANSITIONS, ORD_PER_PAGE } from "./types";

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
    safeOrdPage * ORD_PER_PAGE
  );

  // eslint-disable-next-line react-hooks/purity -- Date.now() is intentionally used for urgency calculation, same as original
  const nowMs = useMemo(() => Date.now(), []);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 flex items-center gap-4">
            <div className="h-5 w-5 bg-gray-200 dark:bg-surface rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/4" />
              <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/2" />
            </div>
            <div className="h-6 w-20 bg-gray-200 dark:bg-surface rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (activeOrders.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBasket className="h-10 w-10 text-gray-300" />}
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
          const urgencyBorder = isUrgent2h
            ? "border-l-4 border-l-red-500"
            : isUrgent1h
              ? "border-l-4 border-l-orange-400"
              : "";
          const driver = (o as DbOrder & { deliveryDriver?: string }).deliveryDriver;

          return (
            <div
              key={o.id}
              className={cn(
                "bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden",
                urgencyBorder,
                selectedOrderIds.has(o.id) && "ring-2 ring-primary"
              )}
            >
              <div
                className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                onClick={() => onSelectOrder(o)}
              >
                {/* Bulk checkbox */}
                <input
                  type="checkbox"
                  checked={selectedOrderIds.has(o.id)}
                  onClick={e => e.stopPropagation()}
                  onChange={() => onToggleSelect(o.id)}
                  className="rounded border-gray-300 text-primary focus:ring-primary shrink-0 self-start mt-1"
                />

                {/* Left: customer info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-foreground">{o.customer.name}</span>
                    {o.customer.phone && (
                      <span className="text-xs font-mono text-gray-400 dark:text-muted">{o.customer.phone}</span>
                    )}
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                      {STATUS_LABELS[o.status]}
                    </span>
                    {isUrgent2h && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 animate-pulse">
                        {"\u26A0"} +2h
                      </span>
                    )}
                    {isUrgent1h && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
                        {"\u23F0"} +1h
                      </span>
                    )}
                    {o.paymentMethod && (
                      <span className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                        o.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {o.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                      </span>
                    )}
                    {o.paymentMethod === "efectivo" && o.deuda && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                        Deuda pendiente
                      </span>
                    )}
                    {driver && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: driverColor(driver) }}
                      >
                        <Bike className="h-3 w-3" /> {driver}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-muted mt-0.5 truncate">{o.customer.location}</p>
                  {storeLat !== null && storeLon !== null && (() => {
                    const gps = parseGps(o.customer.location);
                    if (!gps) return null;
                    const km = haversineKm(storeLat, storeLon, gps.lat, gps.lon);
                    const label = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
                    return (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-semibold">
                        <MapPin className="h-3 w-3 shrink-0" />{label}
                      </span>
                    );
                  })()}
                  <p className="text-xs text-gray-400 dark:text-muted mt-0.5">
                    {formatDate(o.createdAt)} · {o.items.length} producto{o.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{o.total.toFixed(2)}</span>
                  </p>
                </div>

                {/* Right: controls */}
                <div
                  className="flex items-center gap-2 shrink-0 flex-wrap justify-end"
                  onClick={e => e.stopPropagation()}
                >
                  {o.paymentMethod === "yape" && o.status === "pendiente" && (
                    <>
                      <button
                        onClick={() => onVerifyYape(o.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                        title="Confirmar Yape como válido"
                      >
                        <Check className="h-4 w-4" /> Confirmar Yape
                      </button>
                      <button
                        onClick={() => onRejectYape(o.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                        title="Rechazar Yape (pago falso)"
                      >
                        <X className="h-4 w-4" /> Falso
                      </button>
                    </>
                  )}
                  {o.paymentMethod === "efectivo" && o.deuda && (
                    <button
                      onClick={() => onMarkDeudaPaid(o.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200"
                      title="Marcar deuda como cobrada"
                    >
                      <Check className="h-4 w-4" /> Cobrado
                    </button>
                  )}
                  <a
                    href={googleMapsUrl(o.customer.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                    title="Ver en Google Maps"
                  >
                    <MapPin className="h-4 w-4" />
                  </a>
                  <select
                    value={o.status}
                    onChange={e => onUpdateStatus(o.id, e.target.value as OrderStatus)}
                    className="text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border px-2 py-2 outline-none focus:border-primary text-gray-700 dark:text-foreground bg-white dark:bg-card"
                    disabled={!VALID_TRANSITIONS[o.status]?.length}
                  >
                    <option value={o.status}>{STATUS_LABELS[o.status]}</option>
                    {(VALID_TRANSITIONS[o.status] ?? []).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => onDeleteOrder(o.id)}
                    className="p-2 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {activeOrders.length > ORD_PER_PAGE && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={safeOrdPage <= 1}
            onClick={() => onPageChange(Math.max(1, safeOrdPage - 1))}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            Anterior
          </button>
          <span className="text-xs text-gray-500 dark:text-muted">
            Página {safeOrdPage} de {ordTotalPages} · {activeOrders.length} pedidos
          </span>
          <button
            disabled={safeOrdPage >= ordTotalPages}
            onClick={() => onPageChange(safeOrdPage + 1)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            Siguiente
          </button>
        </div>
      )}
    </>
  );
}
