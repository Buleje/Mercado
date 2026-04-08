"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { DeliveryStopView, LiveTrackingEvent } from "./types";

/**
 * LiveMap — renderiza un mapa Leaflet con las paradas de la ruta seleccionada
 * y la última posición conocida del repartidor basada en los tracking events.
 *
 * Leaflet se carga dinámicamente via import() para NO meterlo en el bundle
 * principal (el mapa es solo visible dentro del DeliveryTab que es
 * code-splitted con dynamic import).
 */

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];
const DEFAULT_ZOOM = 14;

interface LiveMapProps {
  stops: DeliveryStopView[];
  trackingEvents: LiveTrackingEvent[];
  className?: string;
}

export function LiveMap({ stops, trackingEvents, className }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Usamos `unknown` para no tener que importar los tipos de Leaflet en el
  // módulo principal (lo cargamos dinámico).
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<Array<unknown>>([]);
  const driverMarkerRef = useRef<unknown>(null);

  // Inicializar el mapa una sola vez
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      // Cargar el CSS de Leaflet inyectando un <link> en el head una sola vez.
      // Evita import estático del .css (TS no tipa CSS imports en este setup).
      if (typeof document !== "undefined" && !document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        link.crossOrigin = "";
        document.head.appendChild(link);
      }

      if (mapRef.current) return; // ya inicializado

      const map = L.map(containerRef.current, {
        center: PUCALLPA_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

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

  // Renderizar markers de paradas
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any;

      // Limpiar markers previos
      for (const m of markersRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).remove();
      }
      markersRef.current = [];

      const bounds: Array<[number, number]> = [];

      for (const stop of stops) {
        if (stop.lat == null || stop.lng == null) continue;
        const icon = L.divIcon({
          className: "delivery-stop-marker",
          html: `<div class="stop-pin stop-pin-${stop.status}">${stop.sequence}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([stop.lat, stop.lng], { icon })
          .addTo(map)
          .bindPopup(
            `<strong>#${stop.sequence} ${escapeHtml(stop.customerName)}</strong><br/>` +
              `${escapeHtml(stop.address)}<br/>` +
              `<em>${stop.status}</em>`,
          );
        markersRef.current.push(marker);
        bounds.push([stop.lat, stop.lng]);
      }

      // Driver marker desde el tracking más reciente con coords
      const driverEvent = trackingEvents.find((e) => e.lat != null && e.lng != null);
      if (driverEvent?.lat != null && driverEvent?.lng != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (driverMarkerRef.current) (driverMarkerRef.current as any).remove();
        const driverIcon = L.divIcon({
          className: "delivery-driver-marker",
          html: `<div class="driver-pin">🛵</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        driverMarkerRef.current = L.marker([driverEvent.lat, driverEvent.lng], {
          icon: driverIcon,
        })
          .addTo(map)
          .bindPopup(`Repartidor · ${driverEvent.status}`);
        bounds.push([driverEvent.lat, driverEvent.lng]);
      }

      // Fit bounds si hay al menos 1 marker
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
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
          "h-full w-full rounded-xl border border-slate-200 dark:border-slate-700",
          className,
        )}
        role="application"
        aria-label="Mapa de delivery con paradas y ubicación del repartidor"
      />
      {/* Estilos inline para los markers custom (div-based, no imágenes) */}
      <style jsx global>{`
        .delivery-stop-marker .stop-pin {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          color: white;
          font-size: 12px;
          font-weight: 700;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        .delivery-stop-marker .stop-pin-pending {
          background: #64748b;
        }
        .delivery-stop-marker .stop-pin-arrived {
          background: #f59e0b;
        }
        .delivery-stop-marker .stop-pin-delivered {
          background: #16a34a;
        }
        .delivery-stop-marker .stop-pin-failed {
          background: #dc2626;
        }
        .delivery-stop-marker .stop-pin-skipped {
          background: #94a3b8;
        }
        .delivery-driver-marker .driver-pin {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          font-size: 22px;
          background: #00b4a6;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0, 180, 166, 0.5);
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
