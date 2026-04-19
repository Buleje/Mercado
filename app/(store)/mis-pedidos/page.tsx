"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Package, Clock, CheckCircle2, Truck, XCircle,
  ClipboardList, Search, RotateCcw, ChevronDown,
  ArrowLeft, ShoppingCart, Share2, MapPin, Phone,
  X, ChevronRight, Download,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import {
  CanastaVacia,
  LupaConfundida,
  IllustrationCard,
} from "@/components/ui-system/illustrations";
import { MOCK_ORDERS } from "@/lib/customer-orders.mock";
import type { MockOrder } from "@/lib/customer-orders.mock";
import type { MockOrderItem } from "@/lib/customer-orders.mock";
const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const QuickReorderModal = dynamic(() => import("@/components/QuickReorderModal"));

// ── Types (mantiene compatibilidad con API real) ────────────────────
type Order = {
  id: string;
  items?: MockOrderItem[];
  total?: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo";
  createdAt: string;
  updatedAt: string;
  notes?: string;
  storeName?: string;
  storeDistance?: string;
  deliveryAddress?: string;
  deliveryWindow?: string;
  courierName?: string;
  courierPhone?: string;
};

// ── Config ─────────────────────────────────────────────────────────
const STATUS_CFG = {
  pendiente: {
    label: "Pendiente",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-400",
    Icon: Clock,
  },
  confirmado: {
    label: "Confirmado",
    cls: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    dot: "bg-teal-400",
    Icon: CheckCircle2,
  },
  en_camino: {
    label: "En camino",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-400",
    Icon: Truck,
  },
  entregado: {
    label: "Entregado",
    cls: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    dot: "bg-teal-400",
    Icon: CheckCircle2,
  },
  cancelado: {
    label: "Cancelado",
    cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-400",
    Icon: XCircle,
  },
} as const;

const ACTIVE_STATUSES = ["pendiente", "confirmado", "en_camino"] as const;
type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "en_curso", label: "En curso" },
  { key: "entregado", label: "Entregados" },
  { key: "cancelado", label: "Cancelados" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

// ── Timeline steps ─────────────────────────────────────────────────
const TIMELINE_STEPS = [
  { status: "pendiente" as const, label: "Pedido recibido", Icon: Clock },
  { status: "confirmado" as const, label: "Preparando", Icon: CheckCircle2 },
  { status: "en_camino" as const, label: "En camino", Icon: Truck },
  { status: "entregado" as const, label: "Entregado", Icon: Package },
] as const;

// ── Helpers ────────────────────────────────────────────────────────
function fmt(n?: number | null) {
  return `S/${(n ?? 0).toFixed(2)}`;
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── OrderTimeline (componente visual) ─────────────────────────────
function OrderTimeline({ status }: { status: Order["status"] }) {
  if (status === "cancelado") {
    return (
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
          Pedido cancelado
        </span>
      </div>
    );
  }

  const currentIdx = TIMELINE_STEPS.findIndex((s) => s.status === status);

  return (
    <div className="relative">
      {/* Connector line */}
      <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-100 dark:bg-surface" />
      <div
        className="absolute top-4 left-4 h-0.5 bg-primary/40 transition-all duration-500"
        style={{
          width:
            currentIdx <= 0
              ? "0%"
              : `${(currentIdx / (TIMELINE_STEPS.length - 1)) * 100}%`,
        }}
      />

      <div className="relative flex justify-between">
        {TIMELINE_STEPS.map((step, i) => {
          const isCompleted = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isPending = i > currentIdx;
          const Icon = step.Icon;

          return (
            <div key={step.status} className="flex flex-col items-center gap-1.5 w-16">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 relative",
                  isCurrent
                    ? "bg-primary text-white shadow-md shadow-primary/30 scale-110"
                    : isCompleted
                    ? "bg-primary/20 text-primary"
                    : "bg-gray-100 dark:bg-surface text-gray-300"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span
                className={cn(
                  "text-[length:var(--ts-2xs)] font-medium text-center leading-tight",
                  isCurrent
                    ? "text-primary font-bold"
                    : isCompleted
                    ? "text-muted"
                    : "text-gray-300 dark:text-muted/40"
                )}
              >
                {step.label}
              </span>
              {isCurrent && (
                <span className="text-[8px] text-primary/70 font-bold uppercase tracking-wider">
                  Ahora
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Order Detail Modal ─────────────────────────────────────────────
function OrderDetailModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const st = STATUS_CFG[order.status] ?? STATUS_CFG.pendiente;
  const items = order.items ?? [];
  const isActive = ACTIVE_STATUSES.includes(order.status as ActiveStatus);

  // Trap focus + close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del pedido #${order.id.slice(-6).toUpperCase()}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-lg bg-white dark:bg-card rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-card z-10 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
          <div>
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-muted">
              Pedido
            </span>
            <h2 className="text-base font-extrabold text-foreground leading-tight">
              #{order.id.slice(-6).toUpperCase()}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
                st.cls
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
              {st.label}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-surface flex items-center justify-center hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4 text-muted" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Timeline */}
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-muted mb-3">
              SEGUIMIENTO
            </p>
            <OrderTimeline status={order.status} />
          </div>

          {/* Productos */}
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-muted mb-3">
              PRODUCTOS
            </p>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={`${order.id}-${item.productId ?? item.name}-${idx}`}
                  className="flex items-center gap-3"
                >
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-100 dark:bg-surface shrink-0">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-4 w-4 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.name}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] text-muted">
                      {item.quantity} {item.unit}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-foreground shrink-0 tabular-nums">
                    {fmt((item.price ?? 0) * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 space-y-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-muted mb-2">
              RESUMEN
            </p>
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmt(order.total)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted">
              <span>Delivery</span>
              <span className="text-teal-600 dark:text-teal-400 font-semibold">
                Gratis
              </span>
            </div>
            <div className="flex justify-between font-extrabold text-foreground border-t border-gray-100 dark:border-card-border pt-2">
              <span>Total</span>
              <span className="tabular-nums">{fmt(order.total)}</span>
            </div>
          </div>

          {/* Info entrega */}
          {order.deliveryAddress && (
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-muted mb-2">
                ENTREGA
              </p>
              <div className="flex items-start gap-2 text-sm text-muted">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
                <div>
                  <p className="text-foreground font-medium">{order.deliveryAddress}</p>
                  {order.deliveryWindow && (
                    <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">
                      Ventana: {order.deliveryWindow}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Info repartidor (solo si en camino) */}
          {order.status === "en_camino" && order.courierName && (
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-muted mb-2">
                REPARTIDOR
              </p>
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-100 dark:border-amber-800/30">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {order.courierName}
                  </p>
                  {order.courierPhone && (
                    <p className="text-[length:var(--ts-2xs)] text-muted">{order.courierPhone}</p>
                  )}
                </div>
                {order.courierPhone && (
                  <a
                    href={`https://wa.me/51${order.courierPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-colors"
                  >
                    <Phone className="h-3 w-3" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Fecha y datos extra */}
          <div className="text-[length:var(--ts-2xs)] text-muted space-y-1">
            <p>Pedido realizado el {fmtDateTime(order.createdAt)}</p>
            {order.paymentMethod && (
              <p>
                Pago con{" "}
                {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
              </p>
            )}
            {order.storeName && (
              <p>
                Bodega: {order.storeName}{" "}
                {order.storeDistance ? `· ${order.storeDistance}` : ""}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1 pb-2">
            <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
              <Download className="h-4 w-4" />
              Boleta
            </button>
            {isActive && (
              <Link
                href={`/pedido/${order.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                <Truck className="h-4 w-4" />
                Rastrear en vivo
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── OrderCard ──────────────────────────────────────────────────────
function OrderCard({
  order,
  onViewDetail,
  onReorder,
  onCancel,
}: {
  order: Order;
  onViewDetail: (o: Order) => void;
  onReorder?: (items: MockOrderItem[], orderId?: string, orderDate?: string) => void;
  onCancel?: (id: string) => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const st = STATUS_CFG[order.status] ?? STATUS_CFG.pendiente;
  const { Icon: StIcon } = st;
  const items = order.items ?? [];
  const isActive = ACTIVE_STATUSES.includes(order.status as ActiveStatus);
  const PREVIEW_COUNT = 3;
  const previewItems = items.slice(0, PREVIEW_COUNT);
  const extraCount = items.length - PREVIEW_COUNT;

  return (
    <div
      className={cn(
        "bg-white dark:bg-card rounded-2xl border transition-all duration-200 overflow-hidden",
        isActive
          ? "border-amber-200 dark:border-amber-700/50 shadow-md shadow-amber-100/50 dark:shadow-none"
          : "border-gray-100 dark:border-card-border hover:border-gray-200 dark:hover:border-card-border/80"
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="h-0.5 bg-linear-to-r from-amber-400 to-primary" />
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              order.status === "en_camino"
                ? "bg-amber-50 dark:bg-amber-900/20"
                : order.status === "entregado"
                ? "bg-teal-50 dark:bg-teal-900/20"
                : order.status === "cancelado"
                ? "bg-red-50 dark:bg-red-900/20"
                : "bg-amber-50 dark:bg-amber-900/20"
            )}
          >
            <StIcon
              className={cn(
                "h-4.5 w-4.5",
                order.status === "en_camino"
                  ? "text-amber-500"
                  : order.status === "entregado"
                  ? "text-teal-500"
                  : order.status === "cancelado"
                  ? "text-red-500"
                  : "text-amber-500"
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-sm font-extrabold text-foreground">
                #{order.id.slice(-6).toUpperCase()}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full",
                  st.cls
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", st.dot)} />
                {st.label}
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] text-muted">
              {fmtDate(order.createdAt)}
              {order.paymentMethod && ` · ${order.paymentMethod === "yape" ? "Yape" : "Efectivo"}`}
            </p>
          </div>

          <span className="text-base font-extrabold text-foreground tabular-nums shrink-0">
            {fmt(order.total)}
          </span>
        </div>

        {/* Timeline inline (solo activos) */}
        {isActive && (
          <div className="mt-3 pt-3 border-t border-gray-50 dark:border-card-border">
            <OrderTimeline status={order.status} />
          </div>
        )}
      </div>

      {/* Body: productos preview */}
      <div className="px-4 pb-3">
        {order.storeName && (
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.15em] text-muted mb-2 block">
            {order.storeName}
            {order.storeDistance ? ` · ${order.storeDistance}` : ""}
          </span>
        )}
        <div className="flex flex-col gap-1.5">
          {previewItems.map((item, idx) => (
            <div
              key={`${order.id}-preview-${idx}`}
              className="flex items-center gap-2"
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-surface shrink-0 flex items-center justify-center">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    width={28}
                    height={28}
                    className="object-cover rounded-lg"
                  />
                ) : (
                  <Package className="h-3.5 w-3.5 text-gray-300" />
                )}
              </div>
              <span className="text-xs text-muted truncate">
                {item.quantity} {item.unit} {item.name}
              </span>
            </div>
          ))}
          {extraCount > 0 && (
            <p className="text-[length:var(--ts-2xs)] text-muted pl-9">
              +{extraCount} producto{extraCount > 1 ? "s" : ""} más
            </p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onViewDetail(order)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 dark:border-card-border text-xs font-semibold text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
        >
          Ver detalle
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {isActive && (
          <button
            onClick={() => onViewDetail(order)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <Truck className="h-3.5 w-3.5" />
            Rastrear
          </button>
        )}

        {order.status === "entregado" && onReorder && (
          <button
            onClick={() =>
              onReorder(items, order.id, order.createdAt)
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 dark:border-card-border text-xs font-semibold text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Volver a pedir
          </button>
        )}

        {/* Share */}
        <button
          onClick={() => {
            const lines = [
              `Pedido #${order.id.slice(-6).toUpperCase()}`,
              fmtDate(order.createdAt),
              "",
              ...(order.items ?? []).map(
                (i) => `- ${i.quantity}${i.unit} ${i.name}`
              ),
              "",
              `Total: S/${(order.total ?? 0).toFixed(2)}`,
            ];
            const text = lines.join("\n");
            if (navigator.share) {
              navigator.share({ text }).catch(() => {});
            } else {
              navigator.clipboard.writeText(text).catch(() => {});
            }
          }}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gray-100 dark:bg-surface text-muted text-xs font-bold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
          title="Compartir pedido"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>

        {/* Cancel (solo pendiente) */}
        {order.status === "pendiente" && onCancel && (
          confirmingCancel ? (
            <div className="flex items-center gap-1.5 w-full">
              <button
                onClick={() => {
                  onCancel(order.id);
                  setConfirmingCancel(false);
                }}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" /> Si, cancelar
              </button>
              <button
                onClick={() => setConfirmingCancel(false)}
                className="py-2 px-3 rounded-xl bg-gray-100 dark:bg-card-bg text-muted text-xs font-bold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingCancel(true)}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              title="Cancelar pedido"
            >
              <XCircle className="h-3.5 w-3.5" /> Cancelar
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────
function OrderSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-surface" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-gray-100 dark:bg-surface rounded-full" />
          <div className="h-2.5 w-40 bg-gray-100 dark:bg-surface rounded-full" />
        </div>
        <div className="h-5 w-16 bg-gray-100 dark:bg-surface rounded-full" />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function MisPedidosPage() {
  const { customer, openModal: openCustomerModal } = useCustomer();
  const { addMultiple } = useCart();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identified, setIdentified] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [reorderModal, setReorderModal] = useState<{
    items: MockOrderItem[];
    orderId: string;
    orderDate: string;
  } | null>(null);

  const loadOrders = useCallback(async (phoneNum: string) => {
    const clean = phoneNum.replace(/\D/g, "");
    if (clean.length < 6) {
      setError("Ingresa tu numero completo (minimo 6 digitos)");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/customers/${encodeURIComponent(clean)}/orders`
      );
      if (!res.ok) throw new Error();
      const data: Order[] = await res.json();
      startTransition(() => {
        setOrders(data);
        setIdentified(true);
      });
    } catch {
      // Fallback a mock data para demo
      startTransition(() => {
        setOrders(MOCK_ORDERS as Order[]);
        setIdentified(true);
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customer?.phone && !identified) {
      loadOrders(customer.phone);
    }
  }, [customer, identified, loadOrders]);

  useEffect(() => {
    if (!customer?.phone && !identified && !loading) {
      const t = setTimeout(() => openCustomerModal("profile"), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReorder = useCallback(
    (items: MockOrderItem[], orderId?: string, orderDate?: string) => {
      setReorderModal({
        items,
        orderId: orderId ?? "unknown",
        orderDate: orderDate ? fmtDate(orderDate) : "Pedido anterior",
      });
    },
    []
  );

  const handleCancel = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelado" }),
      });
      if (!res.ok) return;
      setOrders(
        (prev) =>
          prev?.map((o) =>
            o.id === id
              ? { ...o, status: "cancelado" as const, updatedAt: new Date().toISOString() }
              : o
          ) ?? null
      );
    } catch {
      /* silent */
    }
  }, []);

  const safeOrders = orders ?? [];
  const activeOrders = safeOrders.filter((o) =>
    ACTIVE_STATUSES.includes(o.status as ActiveStatus)
  );
  const completedOrders = safeOrders.filter((o) => o.status !== "cancelado");
  const totalSpent = completedOrders.reduce((s, o) => s + (o.total ?? 0), 0);

  const filtered = safeOrders.filter((o) => {
    if (filter === "todos") return true;
    if (filter === "en_curso") return ACTIVE_STATUSES.includes(o.status as ActiveStatus);
    return o.status === filter;
  });

  const filterCounts: Record<FilterKey, number> = {
    todos: safeOrders.length,
    en_curso: activeOrders.length,
    entregado: safeOrders.filter((o) => o.status === "entregado").length,
    cancelado: safeOrders.filter((o) => o.status === "cancelado").length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Mis pedidos", url: "https://www.buleje.pe/mis-pedidos" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div
        className="pt-32 sm:pt-36 pb-10 sm:pb-14 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "#060a0d" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Breadcrumb */}
          <nav
            aria-label="Migas de pan"
            className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-white/35 mb-6"
          >
            <Link href="/" className="hover:text-white/60 transition-colors">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/cuenta" className="hover:text-white/60 transition-colors">
              Mi cuenta
            </Link>
            <span>/</span>
            <span className="text-white/55">Mis pedidos</span>
          </nav>

          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/cuenta"
              className="p-2 -ml-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              aria-label="Volver a mi cuenta"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            <div className="flex-1">
              <span className="inline-block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/40 mb-1">
                PEDIDOS
              </span>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white leading-tight tracking-[-0.02em]">
                Todo tu historial
              </h1>
            </div>
          </div>

          {/* Stats — solo si hay pedidos */}
          {identified && safeOrders.length > 0 && (
            <div className="grid grid-cols-3 gap-0 border-y border-white/10 py-5">
              <div className="text-center px-4">
                <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">
                  {completedOrders.length}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-white/40 font-bold uppercase tracking-[0.18em] mt-1.5">
                  Realizados
                </p>
              </div>
              <div className="text-center px-4 border-x border-white/10">
                <p className="text-xl sm:text-2xl font-extrabold text-white tabular-nums tracking-tight">
                  {fmt(totalSpent)}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-white/40 font-bold uppercase tracking-[0.18em] mt-1.5">
                  Invertido
                </p>
              </div>
              <div className="text-center px-4">
                <p
                  className={cn(
                    "text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight",
                    activeOrders.length > 0 ? "text-amber-300" : "text-white/50"
                  )}
                >
                  {activeOrders.length}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-white/40 font-bold uppercase tracking-[0.18em] mt-1.5">
                  En curso
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <main
        id="main-content"
        className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 space-y-4 pb-28"
      >
        {/* Sin identificar */}
        {!identified && !loading && (
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border shadow-sm p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <ClipboardList className="h-8 w-8 text-primary/50" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-foreground">
                Consulta tu historial
              </h2>
              <p className="text-sm text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
                Identificate desde la barra de navegacion para ver todos tus pedidos.
              </p>
            </div>
            <button
              onClick={() => openCustomerModal("profile")}
              className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
            >
              <Search className="h-4 w-4" />
              Ver mis pedidos
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <OrderSkeleton key={i} />)}
          </div>
        )}

        {/* Contenido identificado */}
        {identified && orders !== null && !loading && (
          <>
            {/* Banner pedidos activos */}
            {activeOrders.length > 0 && (
              <div className="relative overflow-hidden bg-white dark:bg-card rounded-2xl border border-amber-100 dark:border-amber-700/40 shadow-sm p-4 flex items-center gap-3">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-amber-50/50 dark:bg-amber-900/10 pointer-events-none" />
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-amber-500 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {activeOrders.length === 1
                      ? "Tienes 1 pedido activo"
                      : `Tienes ${activeOrders.length} pedidos activos`}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">
                    Pronto llegara a tu puerta
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-primary/40 shrink-0" />
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1.5 bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-1.5 overflow-x-auto scrollbar-hide shadow-sm">
              {FILTERS.map(({ key, label }) => {
                const count = filterCounts[key];
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200",
                      filter === key
                        ? "bg-primary text-white shadow-md shadow-primary/20"
                        : "text-muted hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                    )}
                  >
                    {label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center h-4.5 min-w-[1.125rem] px-1.5 rounded-full text-[length:var(--ts-2xs)] font-bold leading-none",
                          filter === key
                            ? "bg-white/25 text-white"
                            : "bg-gray-100 dark:bg-surface text-muted"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Orders list */}
            {filtered.length === 0 ? (
              <IllustrationCard
                size="md"
                illustration={
                  filter !== "todos" ? (
                    <LupaConfundida size={130} />
                  ) : (
                    <CanastaVacia size={140} />
                  )
                }
                kicker={filter !== "todos" ? "Sin resultados" : "Mis pedidos"}
                title={
                  filter !== "todos"
                    ? "Nada coincide con este filtro"
                    : "Haz tu primer pedido"
                }
                description={
                  filter !== "todos"
                    ? "Proba cambiando el filtro para ver otros pedidos."
                    : "Realiza tu primer pedido y veras aca el historial con estado y tiempo de entrega."
                }
                primaryAction={
                  filter === "todos" ? (
                    <Link
                      href="/tienda"
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                      <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                      Explorar bodegas
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((o, i) => (
                  <OrderCard
                    key={o.id ?? `order-${i}`}
                    order={o}
                    onViewDetail={setSelectedOrder}
                    onReorder={handleReorder}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            )}

            {/* Bottom CTA */}
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border shadow-sm p-5 text-center space-y-3">
              <p className="text-sm font-bold text-foreground">
                Necesitas algo mas?
              </p>
              <p className="text-xs text-muted">
                Delivery rapido · Paga con Yape o efectivo
              </p>
              <div className="flex gap-2 justify-center">
                <Link
                  href="/tienda"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Hacer otro pedido
                </Link>
                <Link
                  href="/cuenta"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-surface text-foreground text-sm font-semibold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
                >
                  Mi cuenta
                </Link>
              </div>
            </div>
          </>
        )}
      </main>

      <CartSidebar />
      <MobileBottomNav />

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Quick Reorder Modal */}
      {reorderModal && (
        <QuickReorderModal
          items={reorderModal.items}
          orderId={reorderModal.orderId}
          orderDate={reorderModal.orderDate}
          onClose={() => setReorderModal(null)}
          onConfirm={(selected) => {
            if (selected.length) addMultiple(selected);
          }}
        />
      )}
    </div>
  );
}
