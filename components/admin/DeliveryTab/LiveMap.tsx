"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { DeliveryStopView, LiveTrackingEvent } from "./types";

/**
 * LiveMap — Leaflet con paradas + repartidores en vivo + pin de tienda.
 *
 * Mejoras:
 *  - Múltiples drivers (no solo 1) con emoji por vehicleType
 *  - Pulse halo animado para drivers activos (in_transit, nearby, picked_up)
 *  - Línea conectora entre paradas (polyline)
 *  - Pin tienda en el centro (origen)
 *  - Auto-fit con zoom razonable cuando no hay datos
 */

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];
const DEFAULT_ZOOM = 13;

interface LiveMapProps {
  stops: DeliveryStopView[];
  trackingEvents: LiveTrackingEvent[];
  className?: string;
}

const VEHICLE_EMOJI: Record<string, string> = {
  moto: "🏍️",
  motokar: "🛺",
  auto: "🚗",
  bicicleta: "🚴",
  pie: "🚶",
};

function emojiFor(actorType: string): string {
  return VEHICLE_EMOJI[actorType?.toLowerCase()] ?? "🛵";
}

export function LiveMap({ stops, trackingEvents, className }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<Array<unknown>>([]);
  const driverMarkersRef = useRef<Array<unknown>>([]);
  const polylineRef = useRef<unknown>(null);
  const storeMarkerRef = useRef<unknown>(null);

  // Inicializar mapa
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      if (mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: PUCALLPA_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Pin de tienda en el centro (siempre visible)
      const storeIcon = L.divIcon({
        className: "delivery-store-marker",
        html: `<div class="store-pin" title="Tu tienda">🏪</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      storeMarkerRef.current = L.marker(PUCALLPA_CENTER, { icon: storeIcon })
        .addTo(map)
        .bindPopup("<strong>Tu tienda</strong><br/>Punto de recogida de pedidos");

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Refresh stops, drivers, polyline
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any;

      // Limpiar markers previos de paradas
      for (const m of markersRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).remove();
      }
      markersRef.current = [];

      // Limpiar drivers
      for (const m of driverMarkersRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).remove();
      }
      driverMarkersRef.current = [];

      // Limpiar polyline
      if (polylineRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (polylineRef.current as any).remove();
        polylineRef.current = null;
      }

      const bounds: Array<[number, number]> = [PUCALLPA_CENTER];
      const stopsCoords: Array<[number, number]> = [];

      // Markers de paradas
      for (const stop of stops) {
        if (stop.lat == null || stop.lng == null) continue;
        const coords: [number, number] = [stop.lat, stop.lng];
        const icon = L.divIcon({
          className: "delivery-stop-marker",
          html: `<div class="stop-pin stop-pin-${stop.status}">${stop.sequence}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const marker = L.marker(coords, { icon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:180px"><strong>#${stop.sequence} ${escapeHtml(stop.customerName)}</strong><br/>` +
              `<span style="color:#666;font-size:12px">${escapeHtml(stop.address)}</span><br/>` +
              `<em style="text-transform:uppercase;font-size:11px;font-weight:600">${stop.status}</em></div>`,
          );
        markersRef.current.push(marker);
        bounds.push(coords);
        stopsCoords.push(coords);
      }

      // Polyline conectando paradas en secuencia (si hay 2+)
      if (stopsCoords.length >= 2) {
        polylineRef.current = L.polyline(stopsCoords, {
          color: "var(--accent, #00B4A6)",
          weight: 3,
          opacity: 0.6,
          dashArray: "6, 8",
        }).addTo(map);
      }

      // MÚLTIPLES drivers — agrupados por orderId con la posición más reciente
      const driverPositionsByOrder = new Map<string, LiveTrackingEvent>();
      for (const event of trackingEvents) {
        if (event.lat == null || event.lng == null) continue;
        // Solo eventos activos (en movimiento)
        if (!["in_transit", "picked_up", "nearby", "preparing", "ready"].includes(event.status)) continue;
        const existing = driverPositionsByOrder.get(event.orderId);
        if (!existing || new Date(event.createdAt) > new Date(existing.createdAt)) {
          driverPositionsByOrder.set(event.orderId, event);
        }
      }

      for (const event of driverPositionsByOrder.values()) {
        if (event.lat == null || event.lng == null) continue;
        const coords: [number, number] = [event.lat, event.lng];
        const isMoving = ["in_transit", "nearby"].includes(event.status);
        const emoji = emojiFor(event.actorType);
        const driverIcon = L.divIcon({
          className: "delivery-driver-marker",
          html: `
            <div class="driver-wrapper ${isMoving ? "driver-moving" : ""}">
              ${isMoving ? '<div class="driver-pulse"></div>' : ""}
              <div class="driver-pin">${emoji}</div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
        const marker = L.marker(coords, { icon: driverIcon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:180px"><strong>${escapeHtml(event.customerName ?? "Repartidor")}</strong><br/>` +
              `<em style="text-transform:uppercase;font-size:11px;font-weight:600">${event.status}</em>` +
              (event.etaMinutes != null ? `<br/><span style="color:#666;font-size:12px">ETA ${event.etaMinutes} min</span>` : "") +
              `</div>`,
          );
        driverMarkersRef.current.push(marker);
        bounds.push(coords);
      }

      // Auto-fit cuando hay datos. Si no hay, mantener vista de Pucallpa.
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      } else {
        // Reset a vista por defecto centrada en Pucallpa
        map.setView(PUCALLPA_CENTER, DEFAULT_ZOOM);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stops, trackingEvents]);

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "h-full w-full min-h-[400px] rounded-xl overflow-hidden",
          className,
        )}
        role="application"
        aria-label="Mapa de delivery con paradas, repartidores y tienda"
      />
      {/* Estilos inline para los markers custom */}
      <style jsx global>{`
        /* Pin de tienda */
        .delivery-store-marker .store-pin {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          font-size: 22px;
          background: var(--surface-raised, white);
          border-radius: 50%;
          border: 3px solid var(--accent, #00B4A6);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
        }

        /* Paradas */
        .delivery-stop-marker .stop-pin {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          color: white;
          font-size: 14px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          border: 2px solid white;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
        }
        .delivery-stop-marker .stop-pin-pending   { background: #64748b; }
        .delivery-stop-marker .stop-pin-arrived   { background: #f59e0b; }
        .delivery-stop-marker .stop-pin-delivered { background: #16a34a; }
        .delivery-stop-marker .stop-pin-failed    { background: #dc2626; }
        .delivery-stop-marker .stop-pin-skipped   { background: #94a3b8; }

        /* Driver: wrapper + pulse halo + pin */
        .delivery-driver-marker {
          background: transparent !important;
          border: none !important;
        }
        .delivery-driver-marker .driver-wrapper {
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .delivery-driver-marker .driver-pin {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          font-size: 22px;
          background: var(--accent, #00B4A6);
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 3px 10px rgba(0, 180, 166, 0.45);
        }
        .delivery-driver-marker .driver-pulse {
          position: absolute;
          inset: 0;
          z-index: 1;
          border-radius: 50%;
          background: var(--accent, #00B4A6);
          opacity: 0.4;
          animation: driverPulse 2s ease-out infinite;
        }
        @keyframes driverPulse {
          0%   { transform: scale(0.6); opacity: 0.55; }
          70%  { transform: scale(1.5); opacity: 0;    }
          100% { transform: scale(1.5); opacity: 0;    }
        }

        /* Zoom controls — más bonitos */
        .leaflet-control-zoom a {
          background-color: var(--surface-raised, white) !important;
          color: var(--text-primary, #0a0a0a) !important;
          border: 1px solid var(--rule-base, #e5e5e5) !important;
          font-weight: 700 !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 34px !important;
          font-size: 18px !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: var(--surface-sunken, #f5f5f5) !important;
        }
        .leaflet-control-zoom-in {
          border-radius: 12px 12px 0 0 !important;
        }
        .leaflet-control-zoom-out {
          border-radius: 0 0 12px 12px !important;
        }

        /* Popups con estilo del DS */
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18) !important;
        }
        .leaflet-popup-content {
          font-family: inherit !important;
          margin: 12px 16px !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
        }
      `}</style>
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
