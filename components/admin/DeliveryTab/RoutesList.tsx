"use client";

import { useMemo } from "react";
import { Truck, MapPin, Clock, User, Package } from "@buleje/design-system/icons";
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

export function RoutesList({
  routes,
  selectedRouteId,
  onSelectRoute,
  loading,
}: RoutesListProps) {
  const sorted = useMemo(() => {
    return [...routes].sort((a, b) => {
      // En curso primero, después planificadas por hora
      if (a.status === "in_progress" && b.status !== "in_progress") return -1;
      if (b.status === "in_progress" && a.status !== "in_progress") return 1;
      return (
        new Date(a.plannedStartAt).getTime() - new Date(b.plannedStartAt).getTime()
      );
    });
  }, [routes]);

  if (loading && routes.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        <div className="animate-pulse">Cargando rutas del día…</div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="p-6 text-center">
        <Truck className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">
          No hay rutas para hoy. Crea una desde el botón &ldquo;Nueva ruta&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 p-2" role="list">
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

        return (
          <li key={route.id}>
            <button
              type="button"
              onClick={() => onSelectRoute(isSelected ? null : route.id)}
              aria-pressed={isSelected}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition",
                "hover:border-primary/60 hover:bg-primary/5",
                "focus:outline-none focus:ring-2 focus:ring-primary/60",
                "dark:border-slate-700 dark:bg-slate-800/40",
                isSelected
                  ? "border-primary bg-primary/10 dark:bg-primary/10"
                  : "border-slate-200 bg-white",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-2.5 w-2.5 rounded-full",
                      ROUTE_STATUS_COLORS[route.status],
                    )}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {ROUTE_STATUS_LABELS[route.status]}
                  </span>
                </div>
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {plannedTime}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                <User className="h-4 w-4 text-slate-400" />
                {route.driverName}
              </div>

              <div className="mt-2 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {route.completedStops}/{route.totalStops}
                </span>
                {route.totalDistanceM != null && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {(route.totalDistanceM / 1000).toFixed(1)} km
                  </span>
                )}
                {route.vehicleType !== "moto" && (
                  <span className="text-[length:var(--ts-2xs)] uppercase">{route.vehicleType}</span>
                )}
              </div>

              {route.totalStops > 0 && (
                <div className="mt-3">
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                    role="progressbar"
                    aria-valuenow={progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progreso de la ruta: ${progressPct}%`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
