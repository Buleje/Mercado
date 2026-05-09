"use client";

import { useMemo } from "react";
import { Truck, MapPin, Clock, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  ROUTE_STATUS_COLORS,
  ROUTE_STATUS_LABELS,
  type DeliveryRouteView,
} from "./types";

interface RoutesListProps {
  routes: DeliveryRouteView[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  loading: boolean;
}

const VEHICLE_EMOJI: Record<string, string> = {
  moto: "🏍️",
  auto: "🚗",
  bicicleta: "🚴",
  "a pie": "🚶",
  motokar: "🛺",
};

export function RoutesList({
  routes,
  selectedRouteId,
  onSelectRoute,
  loading,
}: RoutesListProps) {
  const sorted = useMemo(() => {
    return [...routes].sort((a, b) => {
      if (a.status === "in_progress" && b.status !== "in_progress") return -1;
      if (b.status === "in_progress" && a.status !== "in_progress") return 1;
      return new Date(a.plannedStartAt).getTime() - new Date(b.plannedStartAt).getTime();
    });
  }, [routes]);

  if (loading && routes.length === 0) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 animate-pulse"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--rule-base)]" />
              <div className="h-3 w-20 rounded bg-[var(--rule-base)]" />
            </div>
            <div className="h-4 w-32 rounded bg-[var(--rule-base)] mb-2" />
            <div className="h-2 w-full rounded-full bg-[var(--rule-base)]" />
          </div>
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="p-8 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-3">
          <Truck className="h-6 w-6 text-[var(--text-tertiary)]" />
        </span>
        <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
          Sin rutas hoy
        </p>
        <p className="text-sm text-[var(--text-tertiary)] mt-1 max-w-xs mx-auto leading-snug">
          Creá una ruta nueva para empezar a despachar pedidos del día.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 p-3" role="list">
      {sorted.map((route) => {
        const isSelected = route.id === selectedRouteId;
        const progressPct =
          route.totalStops > 0
            ? Math.round((route.completedStops / route.totalStops) * 100)
            : 0;
        const plannedTime = new Date(route.plannedStartAt).toLocaleTimeString("es-PE", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const initial = (route.driverName || "?").trim().charAt(0).toUpperCase();
        const isLive = route.status === "in_progress";
        const vehicleIcon = VEHICLE_EMOJI[route.vehicleType?.toLowerCase()] ?? "🚚";

        return (
          <li key={route.id}>
            <button
              type="button"
              onClick={() => onSelectRoute(isSelected ? null : route.id)}
              aria-pressed={isSelected}
              className={cn(
                "w-full rounded-xl border-2 p-4 text-left transition-all",
                "focus:outline-none focus:ring-2 focus:ring-primary/30",
                isSelected
                  ? "border-primary bg-primary/5 shadow-[var(--shadow-sm)]"
                  : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] hover:border-primary/40 hover:bg-primary/[0.03]",
              )}
            >
              {/* Header con status + tiempo */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-2.5 w-2.5 rounded-full",
                      ROUTE_STATUS_COLORS[route.status],
                      isLive && "animate-pulse",
                    )}
                    aria-hidden
                  />
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                    isLive ? "text-primary" : "text-[var(--text-secondary)]",
                  )}>
                    {ROUTE_STATUS_LABELS[route.status]}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)] tabular-nums">
                  <Clock className="h-3.5 w-3.5" />
                  {plannedTime}
                </span>
              </div>

              {/* Driver + vehicle */}
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center text-base font-extrabold shrink-0",
                  isLive ? "bg-primary/10 text-primary" : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
                )}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-extrabold text-[var(--text-primary)] truncate leading-tight">
                    {route.driverName}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
                    <span className="text-base">{vehicleIcon}</span>
                    <span className="capitalize">{route.vehicleType}</span>
                    {route.optimizedByAi && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold bg-[var(--accent-soft)] text-[var(--data-success-500)] uppercase">
                        IA
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Stats: paradas + km */}
              <div className="flex items-center justify-between gap-2 text-sm font-bold text-[var(--text-secondary)] mb-3">
                <span className="inline-flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <span className="tabular-nums">{route.completedStops}/{route.totalStops}</span>
                  <span className="text-[var(--text-tertiary)] font-normal">paradas</span>
                </span>
                {route.totalDistanceM != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-[var(--text-tertiary)]" />
                    <span className="tabular-nums">{(route.totalDistanceM / 1000).toFixed(1)} km</span>
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {route.totalStops > 0 && (
                <div className="space-y-1">
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)] border border-[var(--rule-soft)]"
                    role="progressbar"
                    aria-valuenow={progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progreso de la ruta: ${progressPct}%`}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        progressPct === 100
                          ? "bg-[var(--data-success-500)]"
                          : isLive
                            ? "bg-primary"
                            : "bg-[var(--text-tertiary)]",
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)] text-right">
                    {progressPct}% completado
                  </p>
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
