"use client";

import { useMemo } from "react";
import { Truck, Clock, MapPin, Phone, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { LiveTrackingEvent, DeliveryStopView } from "./types";
import { TRACKING_STATUS_LABELS } from "./types";

interface OrdenesEnVivoPanelProps {
  trackingEvents: LiveTrackingEvent[];
  stops: DeliveryStopView[];
  className?: string;
}

const VEHICLE_EMOJI: Record<string, string> = {
  moto: "🏍️",
  motokar: "🛺",
  auto: "🚗",
  bicicleta: "🚴",
  pie: "🚶",
};

interface ActiveOrder {
  orderId: string;
  customerName: string;
  status: LiveTrackingEvent["status"];
  vehicle: string;
  etaMinutes: number | null;
  distanceM: number | null;
  lastUpdate: string;
  hasLocation: boolean;
  destinationAddress: string | null;
  description: string | null;
}

const STATUS_COLOR: Record<LiveTrackingEvent["status"], { dot: string; bg: string; text: string }> = {
  preparing:  { dot: "bg-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)]",   text: "text-[var(--data-warning-500)]" },
  ready:      { dot: "bg-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)]",   text: "text-[var(--data-warning-500)]" },
  picked_up:  { dot: "bg-primary",                   bg: "bg-primary/10",                 text: "text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  in_transit: { dot: "bg-primary animate-pulse",     bg: "bg-primary/10",                 text: "text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  nearby:     { dot: "bg-primary animate-pulse",     bg: "bg-primary/10",                 text: "text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  delivered:  { dot: "bg-[var(--data-success-500)]", bg: "bg-primary/10",       text: "text-[var(--data-success-500)]" },
  failed:     { dot: "bg-[var(--data-error-500)]",   bg: "bg-[var(--data-error-50)]",     text: "text-[var(--data-error-500)]" },
  cancelled:  { dot: "bg-[var(--text-tertiary)]",    bg: "bg-[var(--surface-sunken)]",    text: "text-[var(--text-tertiary)]" },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 30) return "ahora";
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function OrdenesEnVivoPanel({
  trackingEvents,
  stops,
  className,
}: OrdenesEnVivoPanelProps) {
  // Agregar la última posición/estado por orderId
  const activeOrders: ActiveOrder[] = useMemo(() => {
    const byOrder = new Map<string, LiveTrackingEvent>();
    for (const e of trackingEvents) {
      const existing = byOrder.get(e.orderId);
      if (!existing || new Date(e.createdAt) > new Date(existing.createdAt)) {
        byOrder.set(e.orderId, e);
      }
    }
    const result: ActiveOrder[] = [];
    for (const [orderId, latest] of byOrder) {
      // Buscar la stop asociada al orderId para mostrar dirección
      const stop = stops.find((s) => s.orderId === orderId);
      result.push({
        orderId,
        customerName: latest.customerName ?? stop?.customerName ?? `Orden ${orderId.slice(-6).toUpperCase()}`,
        status: latest.status,
        vehicle: latest.actorType,
        etaMinutes: latest.etaMinutes,
        distanceM: latest.distanceM,
        lastUpdate: latest.createdAt,
        hasLocation: latest.lat != null && latest.lng != null,
        destinationAddress: stop?.address ?? null,
        description: latest.description,
      });
    }
    // Activos primero (in_transit/nearby/picked_up), después por reciente
    return result.sort((a, b) => {
      const aActive = ["in_transit", "nearby", "picked_up"].includes(a.status);
      const bActive = ["in_transit", "nearby", "picked_up"].includes(b.status);
      if (aActive && !bActive) return -1;
      if (bActive && !aActive) return 1;
      return new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime();
    });
  }, [trackingEvents, stops]);

  if (activeOrders.length === 0) {
    return (
      <div className={cn("p-8 text-center", className)}>
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-3">
          <Truck className="h-6 w-6 text-[var(--text-tertiary)]" />
        </span>
        <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
          Sin órdenes activas
        </p>
        <p className="text-sm text-[var(--text-tertiary)] mt-1 max-w-xs mx-auto leading-snug">
          Cuando un cliente haga un pedido, lo verás acá con su tracking en vivo.
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", className)} role="list">
      {activeOrders.map((order) => {
        const meta = STATUS_COLOR[order.status];
        const emoji = VEHICLE_EMOJI[order.vehicle?.toLowerCase()] ?? "🛵";
        const isMoving = ["in_transit", "nearby"].includes(order.status);

        return (
          <li
            key={order.orderId}
            className={cn(
              "rounded-xl border p-4 transition-colors",
              isMoving
                ? "border-primary/30 bg-primary/[0.04]"
                : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]",
            )}
          >
            {/* Header: status + tiempo */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex h-2.5 w-2.5 rounded-full shrink-0", meta.dot)} />
                <span className={cn(
                  "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                  meta.text,
                )}>
                  {TRACKING_STATUS_LABELS[order.status]}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)] tabular-nums">
                <Clock className="h-3.5 w-3.5" />
                hace {relativeTime(order.lastUpdate)}
              </span>
            </div>

            {/* Cliente + vehículo */}
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                "h-11 w-11 rounded-2xl flex items-center justify-center text-xl shrink-0 border-2",
                isMoving
                  ? "bg-primary/10 border-primary/30"
                  : "bg-[var(--surface-raised)] border-[var(--rule-base)]",
              )}>
                {emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-extrabold text-[var(--text-primary)] truncate leading-tight">
                  {order.customerName}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-mono">
                  #{order.orderId.slice(-8).toUpperCase()}
                </p>
              </div>
            </div>

            {/* Stats: ETA, distancia, dirección */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              {order.etaMinutes != null && (
                <div className={cn("rounded-lg p-2 flex items-center gap-2", meta.bg)}>
                  <Clock className={cn("h-4 w-4 shrink-0", meta.text)} />
                  <div className="min-w-0">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      ETA
                    </p>
                    <p className={cn("text-base font-extrabold tabular-nums leading-none", meta.text)}>
                      {order.etaMinutes} min
                    </p>
                  </div>
                </div>
              )}
              {order.distanceM != null && (
                <div className="rounded-lg p-2 flex items-center gap-2 bg-[var(--surface-raised)] border border-[var(--rule-soft)]">
                  <MapPin className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                  <div className="min-w-0">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Distancia
                    </p>
                    <p className="text-base font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
                      {(order.distanceM / 1000).toFixed(1)} km
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Dirección destino */}
            {order.destinationAddress && (
              <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)] mt-2 pt-2 border-t border-[var(--rule-soft)]">
                <User className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--text-tertiary)]" />
                <span className="line-clamp-2 leading-snug">{order.destinationAddress}</span>
              </div>
            )}
            {order.description && (
              <p className="text-xs text-[var(--text-tertiary)] mt-2 line-clamp-2">
                {order.description}
              </p>
            )}

            {/* Indicador sin GPS */}
            {!order.hasLocation && (
              <div className="mt-2 pt-2 border-t border-[var(--rule-soft)] flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] font-bold">
                <Phone className="h-3 w-3" />
                Sin GPS — pedile al rider que active ubicación
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
