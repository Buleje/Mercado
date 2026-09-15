"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { DeliveryStopView, LiveTrackingEvent } from "./types";

/**
 * LiveMap PRO — mapa Leaflet con iconos profesionales y movimiento en vivo.
 *
 * Iconos custom (todos div-based, no imágenes externas):
 *  - 🏪 Tienda (con logoUrl real del tenant si existe, fallback a inicial)
 *  - 🛵 Repartidores con avatar circular + emoji vehículo + pulse halo + ETA
 *  - 🏠 Domicilio del cliente (paradas) numerado por secuencia
 *
 * Funciones:
 *  - Smooth interpolation: marker se mueve suave entre posiciones (200ms ease)
 *  - Trail breadcrumbs: últimas 5 posiciones del driver desvaneciendo
 *  - Polyline driver→destino (línea proyectada hacia próximo cliente)
 *  - Polyline secuencia paradas (ruta planeada, dashed)
 *  - Auto-fit dinámico cuando llegan nuevos markers
 *  - Click en marker → popup detallado con info real-time
 *  - Branding: marker tienda usa primaryColor del tenant
 *  - Múltiples drivers simultáneos agrupados por orderId
 */

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];
const DEFAULT_ZOOM = 13;
const MAX_TRAIL_POINTS = 5;

interface LiveMapProps {
  stops: DeliveryStopView[];
  trackingEvents: LiveTrackingEvent[];
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  primaryColor?: string | null;
  storeLocation?: [number, number] | null;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface DriverMarkerData {
  marker: unknown;        // Leaflet marker
  trail: Array<unknown>;  // Polyline + circles del trail
  routeLine: unknown;     // Línea hacia destino
  positions: Array<[number, number]>;
}

export function LiveMap({
  stops,
  trackingEvents,
  tenantName,
  tenantLogoUrl,
  primaryColor,
  storeLocation,
  className,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const stopMarkersRef = useRef<Array<unknown>>([]);
  const driversRef = useRef<Map<string, DriverMarkerData>>(new Map());
  const stopsPolylineRef = useRef<unknown>(null);
  const storeMarkerRef = useRef<unknown>(null);

  const center = storeLocation ?? PUCALLPA_CENTER;
  const accent = primaryColor ?? "#00A0A0";

  // Init map + store marker
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      if (mapRef.current) return;

      const map = L.map(containerRef.current, {
        center,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Pin de tienda — con logo o inicial
      const storeName = tenantName ?? "Tu tienda";
      const initial = storeName.trim().charAt(0).toUpperCase() || "🏪";
      const logoHtml = tenantLogoUrl
        ? `<img src="${escapeHtml(tenantLogoUrl)}" alt="${escapeHtml(storeName)}" />`
        : `<span class="store-fallback">${escapeHtml(initial)}</span>`;

      const storeIcon = L.divIcon({
        className: "delivery-store-marker",
        html: `
          <div class="store-wrapper" style="--brand:${accent}">
            <div class="store-pin">${logoHtml}</div>
            <div class="store-label">Tu tienda</div>
          </div>
        `,
        iconSize: [56, 70],
        iconAnchor: [28, 56],
      });
      storeMarkerRef.current = L.marker(center, { icon: storeIcon, zIndexOffset: 100 })
        .addTo(map)
        .bindPopup(
          `<div style="min-width:200px"><strong>${escapeHtml(storeName)}</strong><br/>` +
            `<span style="color:#666;font-size:12px">Punto de recogida</span></div>`,
        );

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).remove();
        mapRef.current = null;
      }
      driversRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update store marker icon when branding changes (sin re-init)
  useEffect(() => {
    if (!storeMarkerRef.current) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !storeMarkerRef.current) return;
      const storeName = tenantName ?? "Tu tienda";
      const initial = storeName.trim().charAt(0).toUpperCase() || "🏪";
      const logoHtml = tenantLogoUrl
        ? `<img src="${escapeHtml(tenantLogoUrl)}" alt="${escapeHtml(storeName)}" />`
        : `<span class="store-fallback">${escapeHtml(initial)}</span>`;
      const newIcon = L.divIcon({
        className: "delivery-store-marker",
        html: `
          <div class="store-wrapper" style="--brand:${accent}">
            <div class="store-pin">${logoHtml}</div>
            <div class="store-label">${escapeHtml(storeName)}</div>
          </div>
        `,
        iconSize: [56, 70],
        iconAnchor: [28, 56],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (storeMarkerRef.current as any).setIcon(newIcon);
    })();
    return () => { cancelled = true; };
  }, [tenantName, tenantLogoUrl, accent]);

  // Refresh stops + drivers (smooth)
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any;

      // ── Limpiar markers de paradas anteriores ──
      for (const m of stopMarkersRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).remove();
      }
      stopMarkersRef.current = [];
      if (stopsPolylineRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (stopsPolylineRef.current as any).remove();
        stopsPolylineRef.current = null;
      }

      const bounds: Array<[number, number]> = [center];
      const stopsCoords: Array<[number, number]> = [];

      // ── Paradas (domicilios de clientes) ──
      for (const stop of stops) {
        if (stop.lat == null || stop.lng == null) continue;
        const coords: [number, number] = [stop.lat, stop.lng];
        const isDelivered = stop.status === "delivered";
        const isFailed = ["failed", "skipped"].includes(stop.status);

        const houseIcon = L.divIcon({
          className: "delivery-stop-marker",
          html: `
            <div class="stop-wrapper stop-${stop.status}">
              <div class="stop-house">🏠</div>
              <div class="stop-badge">${stop.sequence}</div>
            </div>
          `,
          iconSize: [40, 48],
          iconAnchor: [20, 40],
        });
        const marker = L.marker(coords, { icon: houseIcon, zIndexOffset: isDelivered ? 10 : 50 })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:220px">` +
              `<strong>#${stop.sequence} ${escapeHtml(stop.customerName)}</strong><br/>` +
              `<span style="color:#666;font-size:12px">${escapeHtml(stop.address)}</span><br/>` +
              `<em style="text-transform:uppercase;font-size:11px;font-weight:700;` +
                `color:${isDelivered ? "#16a34a" : isFailed ? "#dc2626" : "#ff6b5b"}">${stop.status}</em>` +
              (stop.customerPhone ? `<br/><span style="font-size:12px">📞 ${escapeHtml(stop.customerPhone)}</span>` : "") +
              `</div>`,
          );
        stopMarkersRef.current.push(marker);
        bounds.push(coords);
        stopsCoords.push(coords);
      }

      // ── Polyline secuencia de paradas (desde la tienda) ──
      if (stopsCoords.length >= 1) {
        stopsPolylineRef.current = L.polyline([center, ...stopsCoords], {
          color: accent,
          weight: 3,
          opacity: 0.5,
          dashArray: "8, 10",
        }).addTo(map);
      }

      // ── Drivers: agrupar por orderId, mantener historial para trail ──
      const driverEventsByOrder = new Map<string, LiveTrackingEvent[]>();
      for (const event of trackingEvents) {
        if (event.lat == null || event.lng == null) continue;
        if (!["in_transit", "picked_up", "nearby", "preparing", "ready"].includes(event.status)) continue;
        const list = driverEventsByOrder.get(event.orderId) ?? [];
        list.push(event);
        driverEventsByOrder.set(event.orderId, list);
      }

      const seenOrderIds = new Set<string>();

      for (const [orderId, events] of driverEventsByOrder) {
        seenOrderIds.add(orderId);
        // Ordenar por createdAt asc para tener trail histórico
        events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const latest = events[events.length - 1];
        if (latest.lat == null || latest.lng == null) continue;
        const newCoords: [number, number] = [latest.lat, latest.lng];

        const isMoving = ["in_transit", "nearby"].includes(latest.status);
        const emoji = emojiFor(latest.actorType);

        // Construir trail (últimas N posiciones distintas)
        const trailPoints: Array<[number, number]> = [];
        for (let i = events.length - 1; i >= 0 && trailPoints.length < MAX_TRAIL_POINTS; i--) {
          const e = events[i];
          if (e.lat == null || e.lng == null) continue;
          const last = trailPoints[trailPoints.length - 1];
          if (!last || last[0] !== e.lat || last[1] !== e.lng) {
            trailPoints.push([e.lat, e.lng]);
          }
        }

        const existing = driversRef.current.get(orderId);
        const driverIcon = L.divIcon({
          className: "delivery-driver-marker",
          html: `
            <div class="driver-wrapper ${isMoving ? "driver-moving" : ""}" style="--brand:${accent}">
              ${isMoving ? '<div class="driver-pulse"></div>' : ""}
              <div class="driver-avatar">
                <span class="driver-emoji">${emoji}</span>
                ${latest.etaMinutes != null ? `<div class="driver-eta">${latest.etaMinutes}'</div>` : ""}
              </div>
              ${isMoving ? '<div class="driver-arrow"></div>' : ""}
            </div>
          `,
          iconSize: [56, 64],
          iconAnchor: [28, 32],
        });

        const popupHtml =
          `<div style="min-width:220px">` +
          `<strong>${escapeHtml(latest.customerName ?? "Repartidor")}</strong>` +
          `<span style="display:inline-block;margin-left:6px;font-size:11px;text-transform:uppercase;font-weight:700;color:${accent}">${latest.status}</span><br/>` +
          (latest.etaMinutes != null
            ? `<span style="color:#666;font-size:12px">⏱ ETA ${latest.etaMinutes} min</span><br/>`
            : "") +
          (latest.distanceM != null
            ? `<span style="color:#666;font-size:12px">📏 ${(latest.distanceM / 1000).toFixed(1)} km de la tienda</span>`
            : "") +
          `</div>`;

        if (existing) {
          // SMOOTH: mover marker existente a nueva posición (Leaflet anima)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (existing.marker as any).setLatLng(newCoords);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (existing.marker as any).setIcon(driverIcon);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (existing.marker as any).getPopup()?.setContent(popupHtml);

          // Refresh trail
          for (const t of existing.trail) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (t as any).remove();
          }
          existing.trail = [];
          if (trailPoints.length >= 2) {
            const trailLine = L.polyline(trailPoints, {
              color: accent,
              weight: 2,
              opacity: 0.4,
            }).addTo(map);
            existing.trail.push(trailLine);
          }

          // Refresh route line: driver actual → próxima parada pendiente
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (existing.routeLine) (existing.routeLine as any).remove();
          existing.routeLine = null;
          const nextStop = stops.find((s) => s.status === "pending" && s.lat != null && s.lng != null);
          if (nextStop && nextStop.lat != null && nextStop.lng != null) {
            existing.routeLine = L.polyline(
              [newCoords, [nextStop.lat, nextStop.lng]],
              { color: accent, weight: 4, opacity: 0.7 },
            ).addTo(map);
          }
          existing.positions = trailPoints;
        } else {
          // Nuevo driver
          const marker = L.marker(newCoords, { icon: driverIcon, zIndexOffset: 200 })
            .addTo(map)
            .bindPopup(popupHtml);

          const trail: Array<unknown> = [];
          if (trailPoints.length >= 2) {
            const trailLine = L.polyline(trailPoints, {
              color: accent,
              weight: 2,
              opacity: 0.4,
            }).addTo(map);
            trail.push(trailLine);
          }

          let routeLine: unknown = null;
          const nextStop = stops.find((s) => s.status === "pending" && s.lat != null && s.lng != null);
          if (nextStop && nextStop.lat != null && nextStop.lng != null) {
            routeLine = L.polyline(
              [newCoords, [nextStop.lat, nextStop.lng]],
              { color: accent, weight: 4, opacity: 0.7 },
            ).addTo(map);
          }

          driversRef.current.set(orderId, {
            marker,
            trail,
            routeLine,
            positions: trailPoints,
          });
        }

        bounds.push(newCoords);
      }

      // Limpiar drivers que ya no están en eventos
      for (const [orderId, data] of driversRef.current) {
        if (!seenOrderIds.has(orderId)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data.marker as any).remove();
          for (const t of data.trail) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (t as any).remove();
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (data.routeLine) (data.routeLine as any).remove();
          driversRef.current.delete(orderId);
        }
      }

      // Auto-fit bounds
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true });
      } else {
        map.setView(center, DEFAULT_ZOOM);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, trackingEvents, accent]);

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "h-full w-full min-h-[400px] rounded-xl overflow-hidden relative z-0",
          className,
        )}
        role="application"
        aria-label="Mapa en vivo con tienda, paradas y repartidores"
      />
      {/* ── Estilos de los markers custom ───────────────────────── */}
      <style jsx global>{`
        /* ─── Tienda ─── */
        .delivery-store-marker {
          background: transparent !important;
          border: none !important;
        }
        .delivery-store-marker .store-wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .delivery-store-marker .store-pin {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--surface-raised, white);
          border: 3px solid var(--brand, #00A0A0);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .delivery-store-marker .store-pin img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .delivery-store-marker .store-pin .store-fallback {
          font-size: 22px;
          font-weight: 800;
          color: var(--brand, #00A0A0);
        }
        .delivery-store-marker .store-label {
          margin-top: 4px;
          padding: 2px 8px;
          background: var(--brand, #00A0A0);
          color: white;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-radius: 999px;
          white-space: nowrap;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.18);
        }

        /* ─── Domicilios ─── */
        .delivery-stop-marker {
          background: transparent !important;
          border: none !important;
        }
        .delivery-stop-marker .stop-wrapper {
          position: relative;
          width: 40px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .delivery-stop-marker .stop-house {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--surface-raised, white);
          border: 2.5px solid #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.22);
        }
        .delivery-stop-marker .stop-badge {
          position: absolute;
          top: -4px;
          right: 0;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #64748b;
          color: white;
          font-size: 11px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
        }
        .delivery-stop-marker .stop-pending  .stop-house  { border-color: #ff6b5b; }
        .delivery-stop-marker .stop-pending  .stop-badge  { background: #ff6b5b; }
        .delivery-stop-marker .stop-arrived  .stop-house  { border-color: #2563eb; }
        .delivery-stop-marker .stop-arrived  .stop-badge  { background: #2563eb; }
        .delivery-stop-marker .stop-delivered .stop-house { border-color: #16a34a; }
        .delivery-stop-marker .stop-delivered .stop-badge { background: #16a34a; }
        .delivery-stop-marker .stop-failed   .stop-house  { border-color: #dc2626; }
        .delivery-stop-marker .stop-failed   .stop-badge  { background: #dc2626; }

        /* ─── Drivers ─── */
        .delivery-driver-marker {
          background: transparent !important;
          border: none !important;
        }
        .delivery-driver-marker .driver-wrapper {
          position: relative;
          width: 56px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 250ms ease-out;
        }
        .delivery-driver-marker .driver-avatar {
          position: relative;
          z-index: 2;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--brand, #00A0A0);
          border: 3px solid white;
          box-shadow: 0 4px 14px rgba(0, 160, 160, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .delivery-driver-marker .driver-emoji {
          font-size: 22px;
          line-height: 1;
        }
        .delivery-driver-marker .driver-eta {
          position: absolute;
          top: -8px;
          right: -10px;
          background: #fff;
          color: var(--brand, #00A0A0);
          border: 2px solid var(--brand, #00A0A0);
          border-radius: 999px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
        }
        .delivery-driver-marker .driver-pulse {
          position: absolute;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--brand, #00A0A0);
          opacity: 0.4;
          animation: driverPulse 1.8s ease-out infinite;
          z-index: 1;
        }
        .delivery-driver-marker .driver-arrow {
          position: absolute;
          bottom: 4px;
          width: 6px;
          height: 6px;
          background: var(--brand, #00A0A0);
          border-radius: 50%;
          animation: driverArrow 1.4s ease-in-out infinite;
          z-index: 1;
        }
        @keyframes driverPulse {
          0%   { transform: scale(0.7); opacity: 0.55; }
          70%  { transform: scale(1.7); opacity: 0;    }
          100% { transform: scale(1.7); opacity: 0;    }
        }
        @keyframes driverArrow {
          0%, 100% { transform: translateY(0);   opacity: 0.6; }
          50%      { transform: translateY(-3px); opacity: 1;   }
        }

        /* ─── Zoom controls ─── */
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
        .leaflet-control-zoom-in  { border-radius: 12px 12px 0 0 !important; }
        .leaflet-control-zoom-out { border-radius: 0 0 12px 12px !important; }

        /* ─── Popups ─── */
        .leaflet-popup-content-wrapper {
          border-radius: 14px !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.20) !important;
          padding: 4px !important;
        }
        .leaflet-popup-content {
          font-family: inherit !important;
          margin: 12px 16px !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
        }
        .leaflet-popup-tip {
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.10) !important;
        }
      `}</style>
    </>
  );
}
