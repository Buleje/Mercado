"use client";

/**
 * OrdersKanban — 3 columnas operativas (Por confirmar / Preparando / En camino).
 *
 * Reemplaza la lista vertical larga por un cockpit Kanban que muestra el flujo
 * de trabajo en paralelo. Cada columna tiene:
 *   - Header con label, contador y monto total de la columna
 *   - Cards compactas con cliente, total, motorizado (si hay) y 1 acción primaria
 *
 * En mobile colapsa a tabs horizontales (segmented control).
 *
 * Tipografía editorial: total en font-display italic, eyebrow uppercase.
 */

import { useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import {
  Check, X as XIcon, MapPin, Bike, Clock, AlertTriangle, ShoppingBasket, ArrowRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/admin/EmptyState";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { formatDate, parseGps, haversineKm } from "@/lib/admin-helpers";
import { STATUS_LABELS } from "./types";

interface OrdersKanbanProps {
  activeOrders: DbOrder[];
  loading: boolean;
  storeLat: number | null;
  storeLon: number | null;
  selectedOrderIds: Set<string>;
  driverColor: (name: string) => string;
  onSelectOrder: (order: DbOrder) => void;
  onToggleSelect: (id: string) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onMarkDeudaPaid: (id: string) => void;
  onDeleteOrder: (id: string) => void;
}

type ColumnId = "pendiente" | "confirmado" | "en_camino";

interface ColumnConfig {
  id: ColumnId;
  label: string;
  description: string;
  accentVar: string;
  emptyMessage: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: "pendiente",
    label: "Por confirmar",
    description: "Yape por verificar · Pago a aprobar",
    accentVar: "var(--data-warning)",
    emptyMessage: "Sin pedidos por confirmar",
  },
  {
    id: "confirmado",
    label: "Preparando",
    description: "Confirmados · Esperan motorizado",
    accentVar: "var(--accent)",
    emptyMessage: "Nada en preparación",
  },
  {
    id: "en_camino",
    label: "En camino",
    description: "Asignado · Rumbo al cliente",
    accentVar: "var(--text-primary)",
    emptyMessage: "Ningún motorizado en ruta",
  },
];

function urgency(o: DbOrder, nowMs: number): "u2h" | "u1h" | null {
  const ageH = (nowMs - new Date(o.createdAt).getTime()) / 3_600_000;
  if (ageH >= 2) return "u2h";
  if (ageH >= 1) return "u1h";
  return null;
}

interface OrderCardProps {
  order: DbOrder;
  selected: boolean;
  storeLat: number | null;
  storeLon: number | null;
  nowMs: number;
  driverColor: (name: string) => string;
  onSelect: () => void;
  onToggleSelect: () => void;
  onUpdateStatus: (status: OrderStatus) => void;
  onVerifyYape: () => void;
  onRejectYape: () => void;
  onMarkDeudaPaid: () => void;
}

function OrderCard({
  order,
  selected,
  storeLat,
  storeLon,
  nowMs,
  driverColor,
  onSelect,
  onToggleSelect,
  onUpdateStatus,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
}: OrderCardProps) {
  const u = urgency(order, nowMs);
  const driver = (order as DbOrder & { deliveryDriver?: string }).deliveryDriver;
  const initial = order.customer.name.trim().charAt(0).toUpperCase() || "?";

  // Distancia si tenemos GPS
  let distanceLabel: string | null = null;
  if (storeLat !== null && storeLon !== null) {
    const gps = parseGps(order.customer.location);
    if (gps) {
      const km = haversineKm(storeLat, storeLon, gps.lat, gps.lon);
      distanceLabel = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    }
  }

  // Acción primaria por estado
  let primaryAction: { label: string; icon: typeof Check; onClick: () => void; variant: "primary" | "warning" | "neutral" } | null = null;
  if (order.status === "pendiente" && order.paymentMethod === "yape") {
    primaryAction = { label: "Confirmar Yape", icon: Check, onClick: onVerifyYape, variant: "primary" };
  } else if (order.status === "pendiente") {
    primaryAction = { label: "Confirmar", icon: Check, onClick: () => onUpdateStatus("confirmado"), variant: "primary" };
  } else if (order.status === "confirmado") {
    primaryAction = { label: "En camino", icon: ArrowRight, onClick: () => onUpdateStatus("en_camino"), variant: "primary" };
  } else if (order.status === "en_camino") {
    primaryAction = { label: "Entregado", icon: Check, onClick: () => onUpdateStatus("entregado"), variant: "primary" };
  }

  return (
    <article
      className={cn(
        "group rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition-all duration-150",
        selected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
          : "border-[var(--rule-soft)] hover:border-[var(--accent)]/50 hover:-translate-y-0.5",
        "motion-reduce:hover:translate-y-0",
      )}
    >
      {/* Top stripe — urgencia */}
      {u === "u2h" && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--data-error)] text-white text-xs font-extrabold uppercase tracking-[var(--ls-wider)] animate-pulse">
          <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
          +2h sin avanzar
        </div>
      )}
      {u === "u1h" && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--data-warning)] text-white text-xs font-extrabold uppercase tracking-[var(--ls-wider)]">
          <Clock className="h-3 w-3" strokeWidth={2.5} />
          +1h sin avanzar
        </div>
      )}

      <div
        className="p-4 cursor-pointer"
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            aria-label={`Seleccionar pedido de ${order.customer.name}`}
            className="mt-1.5 rounded border-[var(--rule-base)] text-[var(--accent)] focus:ring-[var(--accent)]/30 shrink-0"
          />
          <span
            aria-hidden
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-base font-bold tracking-tight"
          >
            {initial}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[var(--text-primary)] text-sm truncate leading-tight">
              {order.customer.name}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
              <span className="font-mono">#{order.id.slice(-6)}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(order.createdAt)}</span>
            </p>
            {order.customer.phone && (
              <p className="text-xs font-mono text-[var(--text-tertiary)] mt-0.5 truncate">
                {order.customer.phone}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-extrabold tabular-nums text-[var(--text-primary)] leading-none">
              S/{order.total.toFixed(2)}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
            </p>
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {order.paymentMethod && (
            <span
              className={cn(
                "inline-flex px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider",
                order.paymentMethod === "yape"
                  ? "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)]"
                  : "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/25",
              )}
            >
              {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
            </span>
          )}
          {order.paymentMethod === "efectivo" && order.deuda && (
            <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-[var(--data-error)]/10 text-[var(--data-error)] border border-[var(--data-error)]/30">
              Deuda
            </span>
          )}
          {distanceLabel && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold text-[var(--accent)] bg-[var(--accent-soft)]/60">
              <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
              {distanceLabel}
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

        {/* Action row */}
        <div
          className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--rule-soft)]"
          onClick={(e) => e.stopPropagation()}
        >
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-colors",
                "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]",
              )}
            >
              <primaryAction.icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              {primaryAction.label}
            </button>
          )}
          {order.status === "pendiente" && order.paymentMethod === "yape" && (
            <button
              type="button"
              onClick={onRejectYape}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-[var(--data-error)] bg-[var(--data-error)]/10 hover:bg-[var(--data-error)]/20 border border-[var(--data-error)]/30 transition-colors"
              title="Rechazar Yape"
              aria-label="Rechazar Yape (pago falso)"
            >
              <XIcon className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
          {order.paymentMethod === "efectivo" && order.deuda && (
            <button
              type="button"
              onClick={onMarkDeudaPaid}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-bold text-[var(--data-success)] bg-[var(--data-success)]/10 hover:bg-[var(--data-success)]/20 border border-[var(--data-success)]/30 transition-colors"
              title="Marcar deuda como cobrada"
            >
              <Check className="h-3.5 w-3.5" /> Cobrado
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

interface KanbanColumnProps extends ColumnConfig {
  orders: DbOrder[];
  selectedOrderIds: Set<string>;
  storeLat: number | null;
  storeLon: number | null;
  nowMs: number;
  driverColor: (name: string) => string;
  onSelectOrder: (o: DbOrder) => void;
  onToggleSelect: (id: string) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onMarkDeudaPaid: (id: string) => void;
}

function KanbanColumn({
  label,
  description,
  accentVar,
  emptyMessage,
  orders,
  selectedOrderIds,
  storeLat,
  storeLon,
  nowMs,
  driverColor,
  onSelectOrder,
  onToggleSelect,
  onUpdateStatus,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
}: KanbanColumnProps) {
  const total = orders.reduce((s, o) => s + o.total, 0);
  return (
    <div className="flex flex-col min-h-0">
      {/* Column header — patrón estándar (SectionTitle DS, sin tipografía editorial) */}
      <div className="flex items-baseline justify-between gap-2 px-1 pb-3 mb-3 border-b-2" style={{ borderColor: accentVar }}>
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-0.5">
            {description}
          </p>
          <SectionTitle>{label}</SectionTitle>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
          </p>
          <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
            S/{total.toFixed(0)}
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-3 min-h-[200px]">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 rounded-2xl border-2 border-dashed border-[var(--rule-soft)] text-center">
            <ShoppingBasket className="h-8 w-8 text-[var(--text-tertiary)] opacity-40" strokeWidth={1.5} />
            <p className="mt-2 text-xs font-bold text-[var(--text-tertiary)]">{emptyMessage}</p>
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              selected={selectedOrderIds.has(o.id)}
              storeLat={storeLat}
              storeLon={storeLon}
              nowMs={nowMs}
              driverColor={driverColor}
              onSelect={() => onSelectOrder(o)}
              onToggleSelect={() => onToggleSelect(o.id)}
              onUpdateStatus={(s) => onUpdateStatus(o.id, s)}
              onVerifyYape={() => onVerifyYape(o.id)}
              onRejectYape={() => onRejectYape(o.id)}
              onMarkDeudaPaid={() => onMarkDeudaPaid(o.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function OrdersKanban({
  activeOrders,
  loading,
  storeLat,
  storeLon,
  selectedOrderIds,
  driverColor,
  onSelectOrder,
  onToggleSelect,
  onUpdateStatus,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
}: OrdersKanbanProps) {
  // Mobile: tab segmented control para mostrar 1 columna por vez
  const [mobileColumn, setMobileColumn] = useState<ColumnId>("pendiente");

  // eslint-disable-next-line react-hooks/purity -- intencional para urgency
  const nowMs = useMemo(() => Date.now(), []);

  const columnsData = useMemo(() => {
    const map: Record<ColumnId, DbOrder[]> = { pendiente: [], confirmado: [], en_camino: [] };
    for (const o of activeOrders) {
      if (o.status === "pendiente") map.pendiente.push(o);
      else if (o.status === "confirmado") map.confirmado.push(o);
      else if (o.status === "en_camino") map.en_camino.push(o);
    }
    return map;
  }, [activeOrders]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {[1, 2, 3].map((c) => (
          <div key={c} className="space-y-3">
            <div className="h-12 skeleton-shimmer rounded-lg" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 skeleton-shimmer rounded-2xl" />
            ))}
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
        description="Cuando llegue uno nuevo aparecerá aquí en tiempo real."
        actions={[]}
      />
    );
  }

  return (
    <>
      {/* Mobile: segmented control */}
      <div className="lg:hidden flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]">
        {COLUMNS.map((col) => {
          const count = columnsData[col.id].length;
          const isActive = mobileColumn === col.id;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => setMobileColumn(col.id)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                isActive
                  ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {col.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-extrabold tabular-nums",
                  isActive ? "bg-[var(--surface-canvas)]/20" : "bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile single column */}
      <div className="lg:hidden mt-4">
        {COLUMNS.filter((c) => c.id === mobileColumn).map((col) => (
          <KanbanColumn
            key={col.id}
            {...col}
            orders={columnsData[col.id]}
            selectedOrderIds={selectedOrderIds}
            storeLat={storeLat}
            storeLon={storeLon}
            nowMs={nowMs}
            driverColor={driverColor}
            onSelectOrder={onSelectOrder}
            onToggleSelect={onToggleSelect}
            onUpdateStatus={onUpdateStatus}
            onVerifyYape={onVerifyYape}
            onRejectYape={onRejectYape}
            onMarkDeudaPaid={onMarkDeudaPaid}
          />
        ))}
      </div>

      {/* Desktop 3 columns */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-5">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            {...col}
            orders={columnsData[col.id]}
            selectedOrderIds={selectedOrderIds}
            storeLat={storeLat}
            storeLon={storeLon}
            nowMs={nowMs}
            driverColor={driverColor}
            onSelectOrder={onSelectOrder}
            onToggleSelect={onToggleSelect}
            onUpdateStatus={onUpdateStatus}
            onVerifyYape={onVerifyYape}
            onRejectYape={onRejectYape}
            onMarkDeudaPaid={onMarkDeudaPaid}
          />
        ))}
      </div>
    </>
  );
}

// Re-export STATUS_LABELS para que componentes que importaban OrdersList sigan
// teniendo acceso si lo necesitan.
export { STATUS_LABELS };
