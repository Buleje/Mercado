"use client";

/**
 * LiveOrderBanner — Barra persistente con el pedido activo del user.
 *
 * Sticky abajo del header en mobile y desktop. Permite al vecino seguir
 * comprando/navegando sin perder de vista el pedido activo.
 *
 * Muestra:
 *   - Estado (confirmado → preparando → en_camino → llegando)
 *   - ETA
 *   - Mini progress bar
 *   - CTA "Ver detalle" (abre /mis-pedidos/[id])
 *
 * Se oculta automaticamente si el pedido esta entregado/cancelado o
 * si no hay pedido activo.
 *
 * Puede cerrarse temporalmente (localStorage session-scoped) pero
 * reaparece al siguiente evento de estado.
 */

import Link from "next/link";
import { useState, useEffect } from "react";
import { X, Truck, Clock, ChefHat, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type OrderStatus = "confirmado" | "preparando" | "en_camino" | "llegando";

interface LiveOrder {
  id: string;
  status: OrderStatus;
  etaMinutes: number;
  storeName: string;
  orderNumber: string;
}

interface Props {
  order: LiveOrder | null;
  /** URL del detalle. Default /mis-pedidos/[id] */
  detailHref?: (orderId: string) => string;
  /** Clase adicional */
  className?: string;
}

const STATUS_CFG: Record<OrderStatus, { label: string; Icon: typeof Truck; progress: number; tone: "info" | "warning" | "accent" }> = {
  confirmado: { label: "Pedido confirmado", Icon: CheckCircle2, progress: 20, tone: "info" },
  preparando: { label: "En preparación", Icon: ChefHat, progress: 45, tone: "warning" },
  en_camino: { label: "En camino", Icon: Truck, progress: 75, tone: "accent" },
  llegando: { label: "Llegando ahora", Icon: Clock, progress: 95, tone: "accent" },
};

const DISMISS_KEY = "buleje-live-order-dismissed-v1";

export default function LiveOrderBanner({
  order,
  detailHref = (id) => `/mis-pedidos/${id}`,
  className,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [dismissedStatus, setDismissedStatus] = useState<OrderStatus | null>(null);

  // Lee dismissed state al montar
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { orderId: string; status: OrderStatus };
        if (parsed.orderId === order?.id && parsed.status === order.status) {
          setDismissed(true);
          setDismissedStatus(parsed.status);
        }
      }
    } catch {
      /* silent */
    }
  }, [order?.id, order?.status]);

  // Resetear dismissed si cambia el estado
  useEffect(() => {
    if (!order) return;
    if (dismissedStatus && dismissedStatus !== order.status) {
      setDismissed(false);
      setDismissedStatus(null);
      sessionStorage.removeItem(DISMISS_KEY);
    }
  }, [order, dismissedStatus]);

  if (!order || dismissed) return null;

  const cfg = STATUS_CFG[order.status];
  const Icon = cfg.Icon;

  const handleDismiss = () => {
    setDismissed(true);
    setDismissedStatus(order.status);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify({ orderId: order.id, status: order.status }));
    } catch {
      /* silent */
    }
  };

  const toneClass =
    cfg.tone === "accent"
      ? "bg-[var(--accent)] text-[var(--surface-canvas)]"
      : cfg.tone === "warning"
      ? "bg-[var(--data-warning,_#eab308)] text-white"
      : "bg-[var(--text-primary)] text-[var(--surface-canvas)]";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full motion-safe:animate-[slideDown_0.3s_ease-out]",
        "border-b border-[var(--rule-base)] bg-[var(--surface-raised)]",
        className,
      )}
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        {/* Icon + texto */}
        <div className={cn("shrink-0 h-8 w-8 rounded-full flex items-center justify-center", toneClass)}>
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-[var(--text-primary)] truncate">
              {cfg.label} · #{order.orderNumber}
            </p>
            {cfg.tone === "accent" && (
              <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            )}
          </div>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
            {order.storeName} · ETA {order.etaMinutes} min
          </p>
          {/* Mini progress bar */}
          <div aria-hidden className="mt-1 h-0.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                cfg.tone === "accent"
                  ? "bg-[var(--accent)]"
                  : cfg.tone === "warning"
                  ? "bg-[var(--data-warning,_#eab308)]"
                  : "bg-[var(--text-primary)]",
              )}
              style={{ width: `${cfg.progress}%` }}
            />
          </div>
        </div>
        {/* CTA */}
        <Link
          href={detailHref(order.id)}
          className="shrink-0 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--accent)] transition-colors"
        >
          Ver
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Ocultar banner"
          className="shrink-0 p-1 -m-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
