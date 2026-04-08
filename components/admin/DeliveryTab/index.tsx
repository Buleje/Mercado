"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Truck, Activity, AlertCircle } from "lucide-react";
import { RoutesList } from "./RoutesList";
import { StopsTimeline } from "./StopsTimeline";
import { useDeliveryRoutes, useRouteStops, useLiveTrackingFeed } from "./hooks";
import { TRACKING_STATUS_EMOJI, TRACKING_STATUS_LABELS } from "./types";

// LiveMap carga Leaflet dinámicamente para NO meterlo en el bundle principal
const LiveMap = dynamic(
  () => import("./LiveMap").then((m) => ({ default: m.LiveMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/40">
        <p className="text-sm text-slate-500">Cargando mapa…</p>
      </div>
    ),
  },
);

/**
 * DeliveryTab — dashboard del Bloque D1 del Marketplace.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │ Header con título + feed live resumido          │
 *   ├──────────────┬──────────────┬───────────────────┤
 *   │              │              │                   │
 *   │ RoutesList   │ LiveMap      │ StopsTimeline     │
 *   │ (izquierda)  │ (centro)     │ (derecha)         │
 *   │              │              │                   │
 *   └──────────────┴──────────────┴───────────────────┘
 */
export default function DeliveryTab() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const routesState = useDeliveryRoutes();
  const stopsState = useRouteStops(selectedRouteId);
  const trackingState = useLiveTrackingFeed();

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* ── Header ─────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <Truck className="h-6 w-6 text-[#00B4A6]" />
            Delivery en vivo
          </h1>
          <p className="text-xs text-slate-500">
            Bloque D1 del Marketplace · polling 10-20s · los clientes reciben link
            automático por WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#00B4A6]/10 px-3 py-1 font-semibold text-[#00B4A6]">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            {trackingState.events.length} activos
          </span>
          {trackingState.error && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">
              <AlertCircle className="h-3.5 w-3.5" />
              error de feed
            </span>
          )}
        </div>
      </header>

      {/* ── Main 3-column layout ─────────────── */}
      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[300px_1fr_320px]">
        {/* Routes list */}
        <aside
          className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"
          aria-labelledby="routes-heading"
        >
          <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-700">
            <h2
              id="routes-heading"
              className="text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Rutas de hoy
            </h2>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <RoutesList
              routes={routesState.routes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              loading={routesState.loading}
            />
          </div>
        </aside>

        {/* Live map */}
        <section
          className="min-h-[500px]"
          aria-labelledby="map-heading"
        >
          <h2 id="map-heading" className="sr-only">
            Mapa con paradas y repartidor en vivo
          </h2>
          <LiveMap stops={stopsState.stops} trackingEvents={trackingState.events} />
        </section>

        {/* Stops timeline */}
        <aside
          className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"
          aria-labelledby="stops-heading"
        >
          <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-700">
            <h2
              id="stops-heading"
              className="text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Paradas {selectedRouteId ? "de la ruta" : "(seleccioná una ruta)"}
            </h2>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {selectedRouteId ? (
              <StopsTimeline
                stops={stopsState.stops}
                loading={stopsState.loading}
                onMarkStop={stopsState.markStop}
              />
            ) : (
              <div className="p-6 text-center text-sm text-slate-500">
                Elegí una ruta de la izquierda para ver sus paradas.
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Feed vivo ─────────────────────── */}
      <section
        className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40"
        aria-labelledby="feed-heading"
      >
        <h2
          id="feed-heading"
          className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          Últimos eventos del día
        </h2>
        {trackingState.events.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay eventos de tracking todavía. Cuando empiece una entrega aparecerán aquí.
          </p>
        ) : (
          <ul
            className="flex flex-wrap gap-2"
            role="list"
            aria-label="Últimos eventos de tracking"
          >
            {trackingState.events.slice(0, 10).map((event) => (
              <li
                key={event.id}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
              >
                <span aria-hidden>{TRACKING_STATUS_EMOJI[event.status]}</span>
                <span className="font-semibold">{TRACKING_STATUS_LABELS[event.status]}</span>
                <span>{event.customerName ?? event.orderId}</span>
                {event.etaMinutes != null && (
                  <span className="text-slate-500">· ETA {event.etaMinutes} min</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
