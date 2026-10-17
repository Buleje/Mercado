"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation, MapPin } from "@buleje/design-system/icons";
import {
  fetchRoute,
  formatDistance,
  formatEta,
  type RouteResult,
} from "@/lib/delivery/route";

interface DeliveryMapProps {
  destLat: number;
  destLng: number;
  destLabel?: string;
  /** Origen opcional (la tienda) usado mientras no haya GPS del repartidor. */
  originLat?: number;
  originLng?: number;
  className?: string;
}

// Lazy-loaded internamente para evitar problemas de SSR con Leaflet.
// Este componente siempre debe cargarse con next/dynamic ssr:false.

export default function DeliveryMap({
  destLat,
  destLng,
  destLabel = "Destino",
  originLat,
  originLng,
  className = "",
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);

  // URLs para abrir en apps de navegación nativas.
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
  const wazeUrl = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;

  // Origen efectivo: GPS del repartidor si lo tenemos, si no la tienda.
  const origin =
    userPos ??
    (originLat != null && originLng != null
      ? { lat: originLat, lng: originLng }
      : null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocationError(true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // ── Calcular la ruta (origen → destino) cuando hay un origen ───────────────
  useEffect(() => {
    if (!origin) return;
    const ctrl = new AbortController();
    fetchRoute(
      { lat: origin.lat, lng: origin.lng },
      { lat: destLat, lng: destLng },
      { signal: ctrl.signal },
    ).then((r) => {
      if (!ctrl.signal.aborted) setRoute(r);
    });
    return () => ctrl.abort();
  }, [origin?.lat, origin?.lng, destLat, destLng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let mounted = true;

    async function initMap() {
      const L = (await import("leaflet")).default;

      // Fix de íconos por defecto de Leaflet bajo bundler.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (!mounted || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([destLat, destLng], 15);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // ── Ruta real por calle (o línea recta de fallback) ──────────────────
      if (route && route.coords.length >= 2) {
        // Halo de fondo para que la ruta resalte sobre cualquier tile.
        L.polyline(route.coords, {
          color: "white",
          weight: 8,
          opacity: 0.9,
        }).addTo(map);
        L.polyline(route.coords, {
          color: "var(--accent)",
          weight: 5,
          opacity: 0.95,
          dashArray: route.source === "straight" ? "10 8" : undefined,
        }).addTo(map);
      }

      // ── Marcador de destino (coral, casa del cliente) ────────────────────
      const destIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:32px; height:32px;
          background:var(--brand-secondary);
          border:3px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
        "></div>`,
        iconAnchor: [12, 30],
        popupAnchor: [4, -30],
      });
      L.marker([destLat, destLng], { icon: destIcon })
        .addTo(map)
        .bindPopup(destLabel);

      // ── Marcador del repartidor (teal de marca) ──────────────────────────
      if (userPos) {
        const riderIcon = L.divIcon({
          className: "",
          html: `<div style="
            width:18px; height:18px;
            background:var(--accent);
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 5px color-mix(in oklab, var(--accent) 25%, transparent);
          "></div>`,
          iconAnchor: [9, 9],
        });
        L.marker([userPos.lat, userPos.lng], { icon: riderIcon })
          .addTo(map)
          .bindPopup("Tú estás aquí");
      }

      // ── Ajuste de vista: a la ruta si existe, si no a los puntos ──────────
      if (route && route.coords.length >= 2) {
        map.fitBounds(L.latLngBounds(route.coords), { padding: [36, 36] });
      } else if (userPos) {
        map.fitBounds(
          L.latLngBounds([destLat, destLng], [userPos.lat, userPos.lng]),
          { padding: [40, 40] },
        );
      }

      mapInstanceRef.current = map;
    }

    initMap();

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [destLat, destLng, destLabel, userPos, route]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Lectura de distancia + ETA (la pieza estilo Rappi/Uber) */}
      <div className="flex items-stretch border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Distancia
          </span>
          <span className="text-lg font-black tabular-nums text-[var(--text-primary)]">
            {route ? formatDistance(route.distanceKm) : "—"}
          </span>
        </div>
        <div className="w-px bg-[var(--rule-base)]" />
        <div className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Llegada en
          </span>
          <span className="flex items-center gap-1.5 text-lg font-black tabular-nums text-[var(--accent)]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            {route ? formatEta(route.durationMin) : "—"}
          </span>
        </div>
      </div>

      {/* Contenedor del mapa (bordes rectos) */}
      <div
        ref={mapContainerRef}
        className="z-0 h-56 w-full overflow-hidden border border-[var(--rule-base)]"
        style={{ minHeight: "224px" }}
      />

      {locationError && (
        <p className="text-center text-sm font-medium text-[var(--data-warning-600)] dark:text-amber-400">
          No pudimos obtener tu ubicación para trazar la ruta
        </p>
      )}

      {/* Navegación externa (bordes rectos) */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[48px] items-center justify-center gap-2 border border-transparent bg-[var(--data-success-600)] text-base font-bold text-white transition-all hover:bg-[var(--data-success-700)] active:scale-95"
        >
          <Navigation className="h-5 w-5" />
          Google Maps
        </a>
        <a
          href={wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[48px] items-center justify-center gap-2 border border-transparent bg-[#33CCFF] text-base font-bold text-white transition-all hover:bg-sky-500 active:scale-95"
        >
          <MapPin className="h-5 w-5" />
          Waze
        </a>
      </div>
    </div>
  );
}
