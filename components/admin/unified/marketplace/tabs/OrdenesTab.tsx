"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  MessageSquare,
  MapPin,
  Star,
  X,
  Clock,
  CheckCircle2,
  Package,
  Bike,
  Trophy,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
  closestCorners,
} from "@dnd-kit/core";
import { TableSkeleton, type MarketplaceOrder } from "../types";
import OrderDetailDrawer from "../OrderDetailDrawer";

// ── Constantes y helpers ────────────────────────────────────────────────────

// Stages — paleta del DS Buleje, herencia 100% con cualquier preset activo.
// Diseño editorial: chip blanco con icono accent + label en uppercase + counter
// monoespaciado a la derecha. El bg de columna usa --surface-raised para que
// el blanco del card se eleve sobre fondo neutro (sin saturación de color).
const ORDER_STAGES: Array<{
  id: string;
  label: string;
  Icon: React.ElementType;
  iconColor: string;
  accentColor: string;
  next: string | null;
}> = [
  {
    id: "pendiente",
    label: "Pendiente",
    Icon: Clock,
    iconColor: "text-[var(--data-warning-700)]",
    accentColor: "var(--data-warning-500)",
    next: "confirmado",
  },
  {
    id: "confirmado",
    label: "Confirmado",
    Icon: CheckCircle2,
    iconColor: "text-[var(--data-info-700)]",
    accentColor: "var(--data-info-500)",
    next: "preparando",
  },
  {
    id: "preparando",
    label: "Preparando",
    Icon: Package,
    iconColor: "text-[var(--accent-dark)]",
    accentColor: "var(--accent)",
    next: "en_camino",
  },
  {
    id: "en_camino",
    label: "En camino",
    Icon: Bike,
    iconColor: "text-[var(--data-warning-700)]",
    accentColor: "var(--data-warning-500)",
    next: "entregado",
  },
  {
    id: "entregado",
    label: "Entregado",
    Icon: Trophy,
    iconColor: "text-[var(--data-success-700)]",
    accentColor: "var(--data-success-500)",
    next: null,
  },
];

const WHATSAPP_TEMPLATES: Array<{ id: string; label: string; build: (o: MarketplaceOrder) => string }> = [
  {
    id: "confirm",
    label: "Confirmar pedido",
    build: (o) => `Hola ${o.customerName}, recibimos tu pedido #${o.id.slice(-8).toUpperCase()} por S/${Number(o.total).toFixed(2)}. Lo estamos preparando. ¡Gracias por tu compra!`,
  },
  {
    id: "ready",
    label: "Pedido listo",
    build: (o) => `Hola ${o.customerName}, tu pedido #${o.id.slice(-8).toUpperCase()} ya está listo y saliendo en camino.`,
  },
  {
    id: "delivered",
    label: "Entregado",
    build: (o) => `Hola ${o.customerName}, tu pedido #${o.id.slice(-8).toUpperCase()} fue entregado. ¡Gracias por tu preferencia! Si tienes 1 minuto, ¿nos dejarías una reseña?`,
  },
  {
    id: "no-stock",
    label: "Sin stock",
    build: (o) => `Hola ${o.customerName}, lamentamos avisarte que tu pedido #${o.id.slice(-8).toUpperCase()} tiene un producto sin stock. ¿Quieres que te llamemos para acordar reemplazo?`,
  },
  {
    id: "review",
    label: "Pedir reseña ⭐",
    build: (o) => {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const link = `${base}/pedido/${o.id}#reseña`;
      return `Hola ${o.customerName} 🙌. ¿Nos cuentas cómo te fue con tu pedido #${o.id.slice(-8).toUpperCase()}? Tu reseña ayuda a que más vecinos confíen en nosotros: ${link}`;
    },
  },
];

function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("51") || digits.length > 10 ? digits : `51${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  return `hace ${d} d`;
}

// ── Sub-componentes ─────────────────────────────────────────────────────────

function NewOrderToast({ count, onView, onDismiss }: { count: number; onView: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-[var(--color-card)] border border-primary/40 rounded-xl shadow-2xl p-4 flex items-center gap-3 max-w-sm anim-fadeup">
      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <ShoppingCart className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)]">{count} pedido{count !== 1 ? "s" : ""} nuevo{count !== 1 ? "s" : ""}</p>
        <p className="text-xs text-[var(--text-secondary)]">Revisa la columna Pendiente</p>
      </div>
      <button onClick={onView} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark">Ver</button>
      <button onClick={onDismiss} aria-label="Cerrar" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function OrderCard({
  order,
  onAdvance,
  onWhatsApp,
  onRequestReview,
  onOpenDetail,
  advancing,
  isOverlay,
  isDragging,
}: {
  order: MarketplaceOrder;
  onAdvance: () => void;
  onWhatsApp: () => void;
  onRequestReview: () => void;
  onOpenDetail: () => void;
  advancing: boolean;
  isOverlay?: boolean;
  isDragging?: boolean;
}) {
  const stage = ORDER_STAGES.find((s) => s.id === order.status);
  const nextStage = stage?.next ? ORDER_STAGES.find((s) => s.id === stage.next) : null;
  const isDelivered = order.status === "entregado";
  return (
    <div
      onClick={(e) => {
        // No abrir detail si se clickeó un botón / link / drag handle
        if ((e.target as HTMLElement).closest("button, a")) return;
        if (isOverlay) return;
        onOpenDetail();
      }}
      className={cn(
        "bg-white dark:bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-xl p-3 space-y-2 transition-all",
        isOverlay
          ? "shadow-2xl border-[var(--accent)] rotate-2 scale-105 cursor-grabbing"
          : isDragging
          ? "opacity-30 cursor-grabbing"
          : "cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-[var(--text-tertiary)] tracking-tight">
            #{order.id.slice(-8).toUpperCase()}
          </p>
          <p className="text-sm font-extrabold text-[var(--text-primary)] truncate leading-tight">
            {order.customerName}
          </p>
        </div>
        <span className="text-sm font-extrabold text-[var(--accent)] whitespace-nowrap font-mono tabular-nums">
          S/{Number(order.total).toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] font-medium">
        {order.itemsCount} producto{order.itemsCount !== 1 ? "s" : ""} · {relativeTime(order.createdAt)}
      </p>
      {order.customerLocation && (
        <p className="text-xs text-[var(--text-tertiary)] flex items-start gap-1">
          <MapPin className="h-3 w-3 mt-0.5 shrink-0" strokeWidth={2.25} />
          <span className="truncate">{order.customerLocation}</span>
        </p>
      )}
      <div className="flex items-center gap-1.5 pt-1.5">
        {nextStage && (
          <button
            onClick={onAdvance}
            disabled={advancing}
            title={`Pasar a ${nextStage.label}`}
            className="flex-1 inline-flex items-center justify-center gap-1 h-9 px-2.5 rounded-lg bg-[var(--accent)] text-white text-xs font-extrabold uppercase tracking-wide hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50"
          >
            {advancing ? (
              <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} /> {nextStage.label}
              </>
            )}
          </button>
        )}
        {isDelivered && order.customerPhone && (
          <button
            onClick={onRequestReview}
            title="Pedir reseña al cliente"
            className="flex-1 inline-flex items-center justify-center gap-1 h-9 px-2.5 rounded-lg bg-[var(--data-warning-500)] text-white text-xs font-extrabold uppercase tracking-wide hover:brightness-110 transition"
          >
            <Star className="h-3.5 w-3.5 fill-white" strokeWidth={2} /> Reseña
          </button>
        )}
        {order.customerPhone && (
          <button
            onClick={onWhatsApp}
            title="Mensaje por WhatsApp"
            aria-label="Mensaje por WhatsApp"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-[#25D366] text-white hover:brightness-110 transition shrink-0"
          >
            <MessageSquare className="h-4 w-4" strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── DnD wrappers ──────────────────────────────────────────────────────────────

function DraggableOrderCard({
  order,
  ...rest
}: {
  order: MarketplaceOrder;
  onAdvance: () => void;
  onWhatsApp: () => void;
  onRequestReview: () => void;
  onOpenDetail: () => void;
  advancing: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    data: { order },
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <OrderCard order={order} {...rest} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({
  stageId,
  accentColor,
  isOver,
  isActiveTarget,
  children,
}: {
  stageId: string;
  accentColor: string;
  isOver?: boolean;
  isActiveTarget?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver: dndIsOver } = useDroppable({ id: stageId });
  const showHighlight = isOver ?? dndIsOver;
  return (
    <div
      ref={setNodeRef}
      style={
        showHighlight || isActiveTarget
          ? { borderColor: accentColor, backgroundColor: `color-mix(in oklab, ${accentColor} 6%, var(--surface-canvas))` }
          : undefined
      }
      className={cn(
        "rounded-2xl border-2 p-3 min-h-[280px] flex flex-col transition-all",
        showHighlight
          ? "scale-[1.01] shadow-lg"
          : isActiveTarget
          ? "border-dashed"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
      )}
    >
      {children}
    </div>
  );
}

// ── WhatsApp picker ───────────────────────────────────────────────────────────

function WhatsAppPicker({ order, onClose }: { order: MarketplaceOrder; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div role="presentation" className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="whatsapp-modal-title" className="bg-white dark:bg-[var(--color-card)] rounded-2xl border border-[var(--rule-base)] w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle id="whatsapp-modal-title" className="text-sm">WhatsApp a {order.customerName}</CardTitle>
            <p className="text-xs text-[var(--text-secondary)]">{order.customerPhone}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {WHATSAPP_TEMPLATES.map((t) => {
            const msg = t.build(order);
            return (
              <a key={t.id} href={buildWhatsAppUrl(order.customerPhone ?? "", msg)} target="_blank" rel="noreferrer" onClick={onClose}
                className="block px-3 py-2 rounded-lg border border-[var(--rule-base)] hover:border-[#25D366] hover:bg-[#25D366]/5 transition">
                <p className="text-sm font-bold text-[var(--text-primary)]">{t.label}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{msg}</p>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// OrdenesTab
// ─────────────────────────────────────────────
export default function OrdenesTab() {
  const [orders, setOrders]       = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const advancingIdRef = useRef<string | null>(null);
  const [waOrder, setWaOrder]     = useState<MarketplaceOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<MarketplaceOrder | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [knownIds, setKnownIds]   = useState<Set<string> | null>(null);
  const [newCount, setNewCount]   = useState(0);

  // Sensores: pointer (mouse) + touch para mobile, con threshold para no
  // disparar drag al hacer click rápido sobre la card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/marketplace/orders");
      if (!r.ok) throw new Error("fail");
      const d = (await r.json()) as MarketplaceOrder[];
      setOrders(Array.isArray(d) ? d : []);

      if (knownIds === null) {
        setKnownIds(new Set(d.map((o) => o.id)));
      } else {
        const fresh = d.filter((o) => !knownIds.has(o.id));
        if (fresh.length > 0) {
          setNewCount((c) => c + fresh.length);
          try {
            const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
            if (Ctx) {
              const ctx = new Ctx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880;
              gain.gain.value = 0.05;
              osc.start();
              osc.stop(ctx.currentTime + 0.18);
              osc.addEventListener("ended", () => ctx.close());
            }
          } catch { /* noop */ }
        }
        setKnownIds(new Set(d.map((o) => o.id)));
      }
    } catch {
      if (!opts?.silent) setError("No se pudieron cargar las órdenes del marketplace.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [knownIds]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // U1: pausar polling mientras hay un advance en curso para no pisar optimistic update
    const t = setInterval(() => {
      if (advancingIdRef.current) return;
      load({ silent: true });
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const advance = async (order: MarketplaceOrder) => {
    const stage = ORDER_STAGES.find((s) => s.id === order.status);
    if (!stage?.next) return;
    await setStatus(order.id, stage.next);
  };

  // setStatus — usado tanto por advance() como por drag&drop. Permite
  // mover una orden a CUALQUIER stage válido (incluso saltar etapas si
  // el admin necesita corregir manualmente).
  const setStatus = useCallback(async (orderId: string, newStatus: string) => {
    const previous = orders.find((o) => o.id === orderId);
    if (!previous || previous.status === newStatus) return;

    // Optimistic update
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    setAdvancingId(orderId);
    advancingIdRef.current = orderId;
    try {
      // FIX 2026-05-06 (audit team): endpoint correcto es /api/marketplace/orders
      // (antes /api/orders → 404 silencioso, drag rebotaba).
      const res = await fetch(`/api/marketplace/orders/${orderId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo actualizar el estado");
      }
    } catch (e) {
      // Rollback en caso de error
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: previous.status } : o)));
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado del pedido.");
    } finally {
      setAdvancingId(null);
      advancingIdRef.current = null;
    }
  }, [orders]);

  // ── Drag & drop handlers ──────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  };
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const overId = e.over?.id;
    const activeId = e.active.id;
    if (!overId) return;
    const stage = ORDER_STAGES.find((s) => s.id === overId);
    if (!stage) return;
    void setStatus(String(activeId), stage.id);
  };

  const draggedOrder = activeDragId
    ? orders.find((o) => o.id === activeDragId) ?? null
    : null;

  if (loading) return <TableSkeleton />;

  // KPIs por estado del pipeline
  const ordersByStage = ORDER_STAGES.map((s) => ({
    stage: s,
    count: orders.filter((o) => o.status === s.id).length,
  }));
  const inProgress = ordersByStage
    .filter((x) => x.stage.id !== "entregado")
    .reduce((sum, x) => sum + x.count, 0);
  const completedToday = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return orders.filter(
      (o) => o.status === "entregado" && new Date(o.createdAt) >= start,
    ).length;
  })();

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con header + KPIs ────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Pipeline de pedidos
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {orders.length === 0
                  ? "Aún no hay pedidos. Aparecerán cuando lleguen desde el marketplace."
                  : `${orders.length} ${orders.length === 1 ? "pedido en total" : "pedidos en total"} · auto-refresh cada 30s · arrastrá las cards para cambiar de etapa.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            Refrescar
          </button>
        </div>

        {orders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* KPI: En proceso (suma de no-entregado) */}
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 col-span-2 sm:col-span-1">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                En proceso
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
                {inProgress}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Sin entregar aún
              </p>
            </div>
            {/* 5 KPIs por etapa */}
            {ordersByStage.map((x) => {
              const Icon = x.stage.Icon;
              return (
                <div
                  key={x.stage.id}
                  className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
                      style={{ backgroundColor: `color-mix(in oklab, ${x.stage.accentColor} 15%, transparent)` }}
                    >
                      <Icon className={cn("h-4 w-4", x.stage.iconColor)} strokeWidth={2.5} />
                    </span>
                    {x.stage.id === "entregado" && completedToday > 0 && (
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Hoy {completedToday}
                      </span>
                    )}
                  </div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {x.stage.label}
                  </p>
                  <p
                    className="text-2xl font-extrabold tabular-nums leading-tight mt-1"
                    style={{ color: x.stage.accentColor }}
                  >
                    {x.count}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. Banner error ─────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-error-500)]/15 shrink-0">
            <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
          </span>
          <p className="text-sm font-bold text-[var(--data-error-500)] flex-1">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="text-sm font-bold text-[var(--data-error-500)] underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── 3. Pipeline kanban / Empty state ────────────────────────── */}
      {orders.length === 0 && !error ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <ShoppingCart className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            Sin órdenes del marketplace aún
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            Las órdenes recibidas desde el marketplace aparecerán acá. Cuando lleguen, podrás arrastrarlas entre etapas.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {ORDER_STAGES.map((stage) => {
              const stageOrders = orders.filter((o) => o.status === stage.id);
              const draggedFromOther =
                !!draggedOrder && draggedOrder.status !== stage.id;
              const Icon = stage.Icon;
              return (
                <DroppableColumn
                  key={stage.id}
                  stageId={stage.id}
                  accentColor={stage.accentColor}
                  isActiveTarget={draggedFromOther}
                >
                  {/* Header editorial Buleje — chip pill con icono accent + label + counter */}
                  <div
                    className="flex items-center gap-3 px-4 h-14 rounded-xl bg-[var(--surface-raised)] border-2 mb-3 shrink-0"
                    style={{ borderColor: `color-mix(in oklab, ${stage.accentColor} 35%, transparent)` }}
                  >
                    {/* Icono pill accent */}
                    <span
                      aria-hidden
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg shrink-0"
                      style={{ backgroundColor: `color-mix(in oklab, ${stage.accentColor} 15%, transparent)` }}
                    >
                      <Icon className={cn("h-4 w-4", stage.iconColor)} strokeWidth={2.5} />
                    </span>
                    {/* Label en uppercase Buleje */}
                    <span className="flex-1 min-w-0 text-[length:var(--ts-sm)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)] truncate leading-none">
                      {stage.label}
                    </span>
                    {/* Counter */}
                    <span
                      className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full font-mono tabular-nums text-[length:var(--ts-sm)] font-extrabold shrink-0"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${stage.accentColor} 12%, transparent)`,
                        color: stage.accentColor,
                      }}
                      aria-label={`${stageOrders.length} pedidos en ${stage.label}`}
                    >
                      {stageOrders.length}
                    </span>
                  </div>

                  {/* Cards draggables */}
                  <div className="space-y-2 flex-1">
                    {stageOrders.length === 0 ? (
                      <div
                        className={cn(
                          "rounded-xl border-2 border-dashed py-8 text-center transition-colors",
                          draggedFromOther
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--rule-base)] text-[var(--text-tertiary)]",
                        )}
                      >
                        <p className="text-sm font-bold">
                          {draggedFromOther ? "Soltá acá" : "Sin pedidos"}
                        </p>
                      </div>
                    ) : (
                      stageOrders.map((o) => (
                        <DraggableOrderCard
                          key={o.id}
                          order={o}
                          onAdvance={() => advance(o)}
                          onWhatsApp={() => setWaOrder(o)}
                          onOpenDetail={() => setDetailOrder(o)}
                          onRequestReview={() => {
                            if (!o.customerPhone) return;
                            const tpl = WHATSAPP_TEMPLATES.find((t) => t.id === "review");
                            if (!tpl) return;
                            window.open(buildWhatsAppUrl(o.customerPhone, tpl.build(o)), "_blank", "noopener");
                          }}
                          advancing={advancingId === o.id}
                        />
                      ))
                    )}
                  </div>
                </DroppableColumn>
              );
            })}
          </div>

          {/* Drag overlay — tarjeta flotante mientras se arrastra */}
          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
            {draggedOrder ? (
              <OrderCard
                order={draggedOrder}
                onAdvance={() => {}}
                onWhatsApp={() => {}}
                onRequestReview={() => {}}
                onOpenDetail={() => {}}
                advancing={false}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Detail drawer */}
      {detailOrder && (
        <OrderDetailDrawer
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onStatusChanged={(orderId, newStatus) => {
            setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
          }}
        />
      )}

      {newCount > 0 && (
        <NewOrderToast
          count={newCount}
          onView={() => { setNewCount(0); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDismiss={() => setNewCount(0)}
        />
      )}

      {waOrder && <WhatsAppPicker order={waOrder} onClose={() => setWaOrder(null)} />}
    </div>
  );
}
