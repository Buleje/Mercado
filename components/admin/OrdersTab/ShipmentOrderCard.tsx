"use client";

/**
 * ShipmentOrderCard — card de pedido para ShipmentTrackingTab.
 * Extraído del módulo padre para habilitar memo y evitar re-renders
 * cuando el polling de 30s devuelve la misma lista.
 *
 * El comparador salta el re-render si id + status + updatedAt + updating
 * no cambiaron. El estado expandido (timeline) es local y no afecta al padre.
 */

import { memo, useState } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Package, MapPin, Clock, CheckCircle, Truck, Phone,
  RefreshCw, User, AlertCircle, ChevronDown, ChevronUp, TimerReset,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import OrderTrackingTimeline from "../logistics/OrderTrackingTimeline";

// ─── Types (re-exportados para que ShipmentTrackingTab pueda importarlos) ─────

export type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

export interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
}

export interface ShipmentOrder {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerLocation?: string;
  customerReference?: string;
  total: number;
  status: OrderStatus;
  notes?: string;
  paymentMethod?: string;
  riderName?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

// ─── Config (copiado de ShipmentTrackingTab para mantener este archivo autónomo)

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pendiente:  { label: "Pendiente",   color: "text-[var(--text-secondary)]",    bg: "bg-[var(--surface-sunken)]" },
  confirmado: { label: "Confirmado",  color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  en_camino:  { label: "En camino",   color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",    bg: "bg-primary/10 dark:bg-primary/15" },
  entregado:  { label: "Entregado",   color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
  cancelado:  { label: "Cancelado",   color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",      bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
};

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente:  ["confirmado", "cancelado"],
  confirmado: ["en_camino", "cancelado"],
  en_camino:  ["entregado", "cancelado"],
  entregado:  [],
  cancelado:  [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}
function fmtMoney(n: number) {
  return `S/ ${n.toFixed(2)}`;
}
function minutesSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

// ─── Progress bar stages ──────────────────────────────────────────────────────

const PROGRESS_STAGES: { key: OrderStatus; label: string }[] = [
  { key: "confirmado", label: "Confirmado" },
  { key: "en_camino",  label: "En camino" },
  { key: "entregado",  label: "Entregado" },
];

function ProgressBar({ status }: { status: OrderStatus }) {
  if (status === "cancelado") {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20 rounded-xl px-3 py-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Pedido cancelado
      </div>
    );
  }
  const currentIdx = PROGRESS_STAGES.findIndex(s => s.key === status);
  return (
    <div className="mt-4 flex items-center gap-0">
      {PROGRESS_STAGES.map((stage, i) => {
        const done    = i <= currentIdx;
        const current = i === currentIdx;
        return (
          <div key={stage.key} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div className={cn(
                "absolute top-3 right-1/2 w-full h-0.5 transition-colors duration-[var(--dur-slow)]",
                done ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
              )} />
            )}
            <m.div
              className={cn(
                "relative z-10 h-6 w-6 rounded-full flex items-center justify-center",
                done ? "bg-primary text-white" : "bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)]",
              )}
              animate={current ? { scale: [1, 1.15, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {i === 0 && <Package className="h-3 w-3" />}
              {i === 1 && <Truck className="h-3 w-3" />}
              {i === 2 && <CheckCircle className="h-3 w-3" />}
            </m.div>
            <span className={cn(
              "text-[length:var(--ts-2xs)] mt-1 font-semibold",
              done ? "text-primary" : "text-[var(--text-tertiary)]"
            )}>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Props + comparador ───────────────────────────────────────────────────────

export interface ShipmentOrderCardProps {
  order: ShipmentOrder;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
  updating: boolean;
}

function arePropsEqual(prev: ShipmentOrderCardProps, next: ShipmentOrderCardProps): boolean {
  return (
    prev.order.id === next.order.id &&
    prev.order.status === next.order.status &&
    prev.order.updatedAt === next.order.updatedAt &&
    prev.updating === next.updating
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

function ShipmentOrderCardImpl({ order, onUpdateStatus, updating }: ShipmentOrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg       = STATUS_CONFIG[order.status];
  const nextSteps = VALID_TRANSITIONS[order.status];
  const mins      = minutesSince(order.createdAt);
  const itemCount = order.items?.reduce((a, i) => a + i.quantity, 0) ?? 0;

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Info izquierda */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                #{order.id.slice(-6).toUpperCase()}
              </h4>
              <m.span
                key={order.status}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", cfg.bg, cfg.color)}
              >
                {cfg.label}
              </m.span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] flex items-center gap-0.5">
                <TimerReset className="h-3 w-3" /> {mins}min
              </span>
            </div>

            <p className="text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium flex items-center gap-1 truncate">
              <User className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
              {order.customerName}
            </p>

            {order.customerLocation && (
              <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="h-3 w-3 shrink-0" /> {order.customerLocation}
              </p>
            )}

            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-1">
              {itemCount} producto{itemCount !== 1 ? "s" : ""} · {fmtMoney(order.total)}
              {order.paymentMethod && (
                <span className="ml-2 text-[length:var(--ts-2xs)] bg-gray-100 dark:bg-surface px-1.5 py-0.5 rounded font-semibold uppercase">
                  {order.paymentMethod}
                </span>
              )}
            </p>
          </div>

          {/* Info derecha */}
          <div className="text-right text-xs shrink-0">
            {order.riderName && (
              <p className="text-[var(--text-secondary)] dark:text-muted flex items-center gap-1 justify-end">
                <Truck className="h-3 w-3" /> {order.riderName}
              </p>
            )}
            {order.customerPhone && (
              <p className="text-[var(--text-tertiary)] flex items-center gap-1 justify-end mt-1">
                <Phone className="h-3 w-3" /> {order.customerPhone}
              </p>
            )}
            <p className="text-[var(--text-tertiary)] flex items-center gap-1 justify-end mt-1">
              <Clock className="h-3 w-3" /> {fmtDate(order.createdAt)} {fmtTime(order.createdAt)}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar status={order.status} />

        {/* Botones de estado */}
        {nextSteps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {nextSteps.map(next => (
              <button
                key={next}
                disabled={updating}
                onClick={() => onUpdateStatus(order.id, next)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  next === "cancelado"
                    ? "bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] hover:bg-[var(--data-error-100)] border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]"
                    : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20 border border-primary/20",
                  updating && "opacity-50 cursor-not-allowed"
                )}
              >
                {updating ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : next === "en_camino" ? (
                  <Truck className="h-3 w-3" />
                ) : next === "entregado" ? (
                  <CheckCircle className="h-3 w-3" />
                ) : next === "confirmado" ? (
                  <Package className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {STATUS_CONFIG[next].label}
              </button>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-primary transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Ocultar" : "Ver historial"}
        </button>
      </div>

      {/* Timeline expandible */}
      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]"
          >
            <div className="p-3 sm:p-5">
              <OrderTrackingTimeline orderId={order.id} currentStatus={order.status} />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

export const ShipmentOrderCard = memo(ShipmentOrderCardImpl, arePropsEqual);
