"use client";

/**
 * OrderLocationMap — mini mapa Leaflet centrado en la dirección del pedido.
 *
 * Heurística simple: usamos Nominatim para geocodificar el address line una
 * sola vez al montar. Si falla (timeout / no encontrado), centramos en
 * Pucallpa con un marcador genérico y mostramos la dirección textual abajo.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";

interface Props {
  address: string;
  district?: string;
  className?: string;
}

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];

export default function OrderLocationMap({ address, district, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let mapInstance: import("leaflet").Map | null = null;

    (async () => {
      await import("leaflet/dist/leaflet.css");
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Geocoding via Nominatim (best-effort, 3s timeout)
      let center: [number, number] = PUCALLPA_CENTER;
      let geocoded = false;
      try {
        const query = encodeURIComponent(`${address}, ${district ?? "Pucallpa"}, Perú`);
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=pe`,
          { signal: ctrl.signal },
        );
        window.clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json()) as Array<{ lat: string; lon: string }>;
          if (data?.[0]) {
            center = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            geocoded = true;
          }
        }
      } catch {
        /* geocoding silencioso */
      }

      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
        attributionControl: false,
      }).setView(center, geocoded ? 16 : 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Marker con popup de la dirección
      const marker = L.marker(center).addTo(map);
      marker
        .bindPopup(
          `<div style="font-weight:700">Tu entrega</div><div style="margin-top:2px;color:#525252">${address}</div>`,
          { closeButton: false },
        )
        .openPopup();

      mapInstance = map;
      setFound(geocoded);
      setLoading(false);

      // Re-sizing con timeout para que el modal termine animation
      window.setTimeout(() => map.invalidateSize(), 300);
    })();

    return () => {
      cancelled = true;
      if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
      }
    };
  }, [address, district]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        ref={containerRef}
        className="w-full h-full rounded-2xl overflow-hidden bg-[var(--surface-sunken)]"
        aria-label="Mapa de la dirección de entrega"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
        </div>
      )}
      {!loading && !found && (
        <div className="absolute bottom-2 left-2 right-2 rounded-xl bg-[var(--surface-canvas)]/95 backdrop-blur px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-md">
          Mostrando zona aproximada de Pucallpa
        </div>
      )}
    </div>
  );
}
