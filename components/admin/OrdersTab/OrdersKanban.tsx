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
 * Tipografía: estándar admin (text-base/text-xl font-extrabold), sin italic.
 */

import { useMemo, useState, useEffect, memo } from "react";
import { SectionTitle } from "@buleje/design-system";
import {
  Check, X as XIcon, MapPin, Bike, Clock, AlertTriangle, ShoppingBasket, ArrowRight, Store, Boxes, ChefHat,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/admin/EmptyState";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { formatDate, parseGps, haversineKm } from "@/lib/admin-helpers";
import { STATUS_LABELS, VALID_TRANSITIONS } from "./types";
import ManualDeliveryModal from "./ManualDeliveryModal";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

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
  // FIX 2026-05-07: callback opcional para entrega manual con razón.
  // Si se provee, el card abre un modal y devuelve la razón formateada.
  onManualDelivery?: (id: string, reason: string) => void;
}

type ColumnId = "pendiente" | "confirmado" | "preparando" | "en_camino";

interface ColumnConfig {
  id: ColumnId;
  label: string;
  description: string;
  accentVar: string;
  emptyMessage: string;
}

const COLUMNS: Array<ColumnConfig & { Icon: React.ElementType; iconColor: string }> = [
  {
    id: "pendiente",
    label: "Por confirmar",
    description: "Yape por verificar · pago a aprobar",
    accentVar: "var(--data-warning-500)",
    Icon: Clock,
    iconColor: "text-[var(--data-warning-700)]",
    emptyMessage: "Sin pedidos por confirmar",
  },
  {
    id: "confirmado",
    label: "Confirmado",
    description: "Aprobados · listos para preparar",
    accentVar: "var(--accent)",
    Icon: ShoppingBasket,
    iconColor: "text-[var(--accent-dark)]",
    emptyMessage: "Nada confirmado",
  },
  {
    id: "preparando",
    label: "Preparando",
    description: "En cocina · armando el pedido",
    accentVar: "var(--data-warning-500)",
    Icon: ChefHat,
    iconColor: "text-[var(--data-warning-700)]",
    emptyMessage: "Nada en preparación",
  },
  {
    id: "en_camino",
    label: "En camino",
    description: "Asignado · rumbo al cliente",
    accentVar: "var(--data-info-500)",
    Icon: Bike,
    iconColor: "text-[var(--data-info-700)]",
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
  // FIX 2026-05-07: si el padre lo provee, el botón "entregado manual" abre
  // un modal que persiste razón en OrderStatusHistory.note. Si no lo provee,
  // cae al patch simple de onUpdateStatus("entregado").
  onManualDelivery?: (reason: string) => void;
}

/**
 * Comparador para OrderCard.
 * Los callbacks son lambdas inline recreadas en cada render de KanbanColumn,
 * por lo que el comparador los ignora y solo observa los datos del pedido.
 */
function areOrderCardPropsEqual(prev: OrderCardProps, next: OrderCardProps): boolean {
  return (
    prev.order.id === next.order.id &&
    prev.order.status === next.order.status &&
    prev.order.updatedAt === next.order.updatedAt &&
    prev.order.total === next.order.total &&
    prev.selected === next.selected &&
    prev.nowMs === next.nowMs &&
    prev.storeLat === next.storeLat &&
    prev.storeLon === next.storeLon
  );
}

const OrderCard = memo(function OrderCard({
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
  onManualDelivery,
}: OrderCardProps) {
  const u = urgency(order, nowMs);
  // FIX 2026-05-07: estado del modal Entrega Manual local a esta card.
  const [manualOpen, setManualOpen] = useState(false);
  const handleManualConfirm = (reason: string) => {
    setManualOpen(false);
    if (onManualDelivery) {
      onManualDelivery(reason);
    } else {
      // Fallback compat: si el padre no provee onManualDelivery, hacemos
      // el patch simple sin razón (la auditoría se pierde pero no rompe).
      onUpdateStatus("entregado");
    }
  };
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
  // FIX 2026-05-07: acción secundaria "Marcar entregado (manual)" en estados
  // confirmado/preparando — útil cuando el cliente vino al mostrador o el dueño
  // entregó sin pasar por delivery. Antes había que mover por en_camino primero.
  let manualDeliverAction: { onClick: () => void } | null = null;
  if (order.status === "pendiente" && order.paymentMethod === "yape") {
    primaryAction = { label: "Confirmar Yape", icon: Check, onClick: onVerifyYape, variant: "primary" };
  } else if (order.status === "pendiente") {
    primaryAction = { label: "Confirmar", icon: Check, onClick: () => onUpdateStatus("confirmado"), variant: "primary" };
  } else if (order.status === "confirmado") {
    primaryAction = { label: "Preparando", icon: ChefHat, onClick: () => onUpdateStatus("preparando"), variant: "primary" };
    manualDeliverAction = { onClick: () => setManualOpen(true) };
  } else if (order.status === "preparando") {
    primaryAction = { label: "En camino", icon: ArrowRight, onClick: () => onUpdateStatus("en_camino"), variant: "primary" };
    manualDeliverAction = { onClick: () => setManualOpen(true) };
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
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--data-error-500)] text-white text-xs font-extrabold uppercase tracking-[var(--ls-wider)] animate-pulse">
          <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
          +2h sin avanzar
        </div>
      )}
      {u === "u1h" && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--data-warning-500)] text-white text-xs font-extrabold uppercase tracking-[var(--ls-wider)]">
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
              S/{Number(order.total).toFixed(2)}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
            </p>
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {/* Chip origen */}
          {(order as DbOrder & { source?: string }).source === "marketplace" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border"
              style={{
                background: "color-mix(in oklab, var(--color-secondary, #f4a261) 12%, transparent)",
                color: "var(--color-secondary, #f4a261)",
                borderColor: "color-mix(in oklab, var(--color-secondary, #f4a261) 30%, transparent)",
              }}
            >
              <Boxes className="h-3 w-3" strokeWidth={2} aria-hidden /> MKT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border"
              style={{
                background: "color-mix(in oklab, var(--color-primary, #2d6a4f) 12%, transparent)",
                color: "var(--color-primary-dark, #1b4332)",
                borderColor: "color-mix(in oklab, var(--color-primary, #2d6a4f) 30%, transparent)",
              }}
            >
              <Store className="h-3 w-3" strokeWidth={2} aria-hidden /> TIENDA
            </span>
          )}
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
            <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] border border-[var(--data-error-500)]/30">
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
                "flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-extrabold uppercase tracking-[var(--ls-wider)] transition-all",
                "bg-[var(--accent-600,var(--accent))] text-white hover:bg-[var(--accent-dark)] shadow-[var(--shadow-sm)] shadow-[var(--accent)]/25 hover:shadow-[var(--shadow-md)] hover:shadow-[var(--accent)]/35 active:scale-[0.99]",
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
              className="inline-flex items-center justify-center h-11 w-11 rounded-lg text-[var(--data-error-500)] bg-[var(--data-error-500)]/10 hover:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)]/30 transition-colors"
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
              className="inline-flex items-center gap-1 min-h-11 px-3 rounded-lg text-xs font-bold text-[var(--data-success-500)] bg-[var(--data-success-500)]/10 hover:bg-[var(--data-success-500)]/20 border border-[var(--data-success-500)]/30 transition-colors"
              title="Marcar deuda como cobrada"
            >
              <Check className="h-3.5 w-3.5" /> Cobrado
            </button>
          )}
          {manualDeliverAction && (
            <button
              type="button"
              onClick={manualDeliverAction.onClick}
              className="inline-flex items-center justify-center h-11 w-11 rounded-lg text-[var(--data-success-500)] bg-[var(--data-success-500)]/10 hover:bg-[var(--data-success-500)]/20 border border-[var(--data-success-500)]/30 transition-colors"
              title="Marcar entregado (entrega manual sin delivery)"
              aria-label="Marcar como entregado manualmente"
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
      <ManualDeliveryModal
        open={manualOpen}
        customerName={order.customer.name}
        onConfirm={handleManualConfirm}
        onCancel={() => setManualOpen(false)}
      />
    </article>
  );
}, areOrderCardPropsEqual);

// ── Draggable wrapper ─────────────────────────────────────────────────────────
function DraggableOrderCard(props: OrderCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.order.id,
    data: { order: props.order },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "outline-none touch-none",
        isDragging ? "opacity-30 cursor-grabbing" : "cursor-grab",
      )}
    >
      <OrderCard {...props} />
    </div>
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
  onManualDelivery?: (id: string, reason: string) => void;
}

const KanbanColumn = memo(function KanbanColumn({
  id,
  label,
  description,
  accentVar,
  Icon,
  iconColor,
  emptyMessage,
  orders,
  selectedOrderIds,
  storeLat,
  storeLon,
  nowMs,
  driverColor,
  isActiveTarget,
  onSelectOrder,
  onToggleSelect,
  onUpdateStatus,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
  onManualDelivery,
}: KanbanColumnProps & {
  Icon: React.ElementType;
  iconColor: string;
  isActiveTarget?: boolean;
}) {
  const total = orders.reduce((s, o) => s + Number(o.total), 0);
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={
        isOver || isActiveTarget
          ? { borderColor: accentVar, backgroundColor: `color-mix(in oklab, ${accentVar} 6%, var(--surface-canvas))` }
          : undefined
      }
      className={cn(
        "flex flex-col min-h-0 rounded-2xl border-2 p-3 transition-all",
        isOver
          ? "scale-[1.01] shadow-[var(--shadow-lg)] ring-4 ring-offset-0"
          : isActiveTarget
          ? "border-dashed"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
      )}
    >
      {/* Header editorial Buleje — chip pill con icono accent + label + counters */}
      <div
        className="flex items-center gap-3 px-4 h-14 rounded-xl bg-[var(--surface-raised)] border-2 mb-3 shrink-0"
        style={{ borderColor: `color-mix(in oklab, ${accentVar} 35%, transparent)` }}
      >
        <span
          aria-hidden
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
          style={{ backgroundColor: `color-mix(in oklab, ${accentVar} 15%, transparent)` }}
        >
          <Icon className={cn("h-4 w-4", iconColor)} strokeWidth={2.5} />
        </span>
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-[length:var(--ts-sm)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)] truncate">
            {label}
          </p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium truncate mt-0.5">
            {description}
          </p>
        </div>
        <div className="text-right shrink-0 leading-tight">
          <p
            className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full font-mono tabular-nums text-[length:var(--ts-sm)] font-extrabold"
            style={{
              backgroundColor: `color-mix(in oklab, ${accentVar} 12%, transparent)`,
              color: accentVar,
            }}
            aria-label={`${orders.length} pedidos en ${label}`}
          >
            {orders.length}
          </p>
          <p className="text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-[var(--text-secondary)] mt-1">
            S/{total.toFixed(0)}
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-3 min-h-[200px]">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]/60 text-center">
            <Icon className={cn("h-8 w-8 opacity-40", iconColor)} strokeWidth={1.5} />
            <p className="mt-2 text-xs font-bold text-[var(--text-tertiary)]">{emptyMessage}</p>
          </div>
        ) : (
          orders.map((o) => (
            <DraggableOrderCard
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
              onManualDelivery={onManualDelivery ? (reason) => onManualDelivery(o.id, reason) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
});

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
  onManualDelivery,
}: OrdersKanbanProps) {
  // Mobile: tab segmented control para mostrar 1 columna por vez
  const [mobileColumn, setMobileColumn] = useState<ColumnId>("pendiente");

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Drag & drop state ──────────────────────────────────────────────────────
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  };
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const overId = e.over?.id;
    const activeId = String(e.active.id);
    if (!overId) return;
    const target = COLUMNS.find((c) => c.id === overId);
    if (!target) return;
    const order = activeOrders.find((o) => o.id === activeId);
    if (!order || order.status === target.id) return;
    const allowed = VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(target.id as OrderStatus)) return;
    onUpdateStatus(activeId, target.id as OrderStatus);
  };

  const draggedOrder = activeDragId
    ? activeOrders.find((o) => o.id === activeDragId) ?? null
    : null;

  const columnsData = useMemo(() => {
    const map: Record<ColumnId, DbOrder[]> = { pendiente: [], confirmado: [], preparando: [], en_camino: [] };
    for (const o of activeOrders) {
      if (o.status === "pendiente") map.pendiente.push(o);
      else if (o.status === "confirmado") map.confirmado.push(o);
      else if (o.status === "preparando") map.preparando.push(o);
      else if (o.status === "en_camino") map.en_camino.push(o);
    }
    return map;
  }, [activeOrders]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((c) => (
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
                "flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                isActive
                  ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-[var(--shadow-sm)]"
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
            onManualDelivery={onManualDelivery}
          />
        ))}
      </div>

      {/* Desktop 4 columns */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-5">
        {COLUMNS.map((col) => {
          const draggedFromOther = !!draggedOrder && draggedOrder.status !== col.id;
          return (
            <KanbanColumn
              key={col.id}
              {...col}
              orders={columnsData[col.id]}
              selectedOrderIds={selectedOrderIds}
              storeLat={storeLat}
              storeLon={storeLon}
              nowMs={nowMs}
              driverColor={driverColor}
              isActiveTarget={draggedFromOther}
              onSelectOrder={onSelectOrder}
              onToggleSelect={onToggleSelect}
              onUpdateStatus={onUpdateStatus}
              onVerifyYape={onVerifyYape}
              onRejectYape={onRejectYape}
              onMarkDeudaPaid={onMarkDeudaPaid}
            />
          );
        })}
      </div>

      {/* Drag overlay — preview de la card flotante */}
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {draggedOrder ? (
          <div className="rotate-2 scale-105 shadow-[var(--shadow-xl)] ring-2 ring-[var(--accent)] rounded-2xl">
            <OrderCard
              order={draggedOrder}
              selected={false}
              storeLat={storeLat}
              storeLon={storeLon}
              nowMs={nowMs}
              driverColor={driverColor}
              onSelect={() => {}}
              onToggleSelect={() => {}}
              onUpdateStatus={() => {}}
              onVerifyYape={() => {}}
              onRejectYape={() => {}}
              onMarkDeudaPaid={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Re-export STATUS_LABELS para que componentes que importaban OrdersList sigan
// teniendo acceso si lo necesitan.
export { STATUS_LABELS };
