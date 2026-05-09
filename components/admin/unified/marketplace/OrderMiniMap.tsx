"use client";

/**
 * OrderMiniMap — mini mapa Leaflet para el drawer de detalle de pedido.
 *
 * - Si llegan lat/lng válidas, las usa.
 * - Si no, geocoding via Nominatim (free, 3s timeout) usando `address`.
 * - Fallback: centro de Pucallpa con badge "zona aproximada".
 *
 * Sigue el mismo patrón que OrderLocationMap (ronda 1) para evitar conflictos.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";

interface Props {
  lat: number | null;
  lng: number | null;
  address: string;
}

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];
const GEOCODE_CACHE_KEY = "bsm-admin-geocode-cache";

interface CachedCoords { lat: number; lng: number }

function getCached(addr: string): CachedCoords | null {
  try {
    const raw = sessionStorage.getItem(GEOCODE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, CachedCoords>;
    return cache[addr] ?? null;
  } catch { return null; }
}

function setCached(addr: string, c: CachedCoords): void {
  try {
    const raw = sessionStorage.getItem(GEOCODE_CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as Record<string, CachedCoords>) : {};
    cache[addr] = c;
    sessionStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch { /* ignore */ }
}

export default function OrderMiniMap({ lat, lng, address }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<CachedCoords | null>(null);
  const [found, setFound] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let mapInstance: import("leaflet").Map | null = null;

    void (async () => {
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

      // Resolver center
      let center: [number, number] = PUCALLPA_CENTER;
      let geocoded = false;

      if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        center = [lat, lng];
        geocoded = true;
      } else if (address && address.trim().length >= 5) {
        const cached = getCached(address);
        if (cached) {
          center = [cached.lat, cached.lng];
          geocoded = true;
        } else {
          try {
            const query = encodeURIComponent(`${address}, Pucallpa, Perú`);
            const ctrl = new AbortController();
            const timer = window.setTimeout(() => ctrl.abort(), 3000);
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=pe`,
              { signal: ctrl.signal, headers: { "Accept-Language": "es" } },
            );
            window.clearTimeout(timer);
            if (res.ok) {
              const data = (await res.json()) as Array<{ lat: string; lon: string }>;
              if (data?.[0]) {
                const la = parseFloat(data[0].lat);
                const ln = parseFloat(data[0].lon);
                if (Number.isFinite(la) && Number.isFinite(ln)) {
                  center = [la, ln];
                  geocoded = true;
                  setCached(address, { lat: la, lng: ln });
                }
              }
            }
          } catch { /* silencioso */ }
        }
      }

      if (cancelled || !containerRef.current) return;
      setCoords({ lat: center[0], lng: center[1] });
      setFound(geocoded);

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

      const marker = L.marker(center).addTo(map);
      marker.bindPopup(
        `<div style="font-weight:700">Entrega</div><div style="margin-top:2px;color:#525252">${address || "Sin dirección"}</div>`,
        { closeButton: false },
      ).openPopup();

      mapInstance = map;
      setLoading(false);

      window.setTimeout(() => map.invalidateSize(), 300);
    })();

    return () => {
      cancelled = true;
      if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
      }
    };
  }, [lat, lng, address]);

  return (
    <div className="relative h-48">
      <div
        ref={containerRef}
        className="w-full h-full bg-[var(--surface-sunken)]"
        aria-label="Mapa de entrega del pedido"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
        </div>
      )}
      {!loading && !found && (
        <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-[var(--surface-canvas)]/95 backdrop-blur px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] shadow-md">
          Zona aproximada · sin coordenadas exactas
        </div>
      )}
      {!loading && coords && (
        <a
          href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
          target="_blank"
          rel="noreferrer"
          className="absolute top-2 right-2 z-[400] inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-white dark:bg-[var(--color-card)] border-2 border-[var(--rule-base)] text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors shadow-sm"
        >
          Google Maps
        </a>
      )}
    </div>
  );
}
