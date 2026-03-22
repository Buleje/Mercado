"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

type Props = {
  lat: number;
  lon: number;
  zoom?: number;
  height?: number;
  /** If provided, the map is interactive: clicking/dragging sets a new location */
  onPick?: (lat: number, lon: number, address: string) => void;
};

export default function LeafletMap({ lat, lon, zoom = 15, height = 200, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet Map instance (dynamically imported)
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet Marker instance (dynamically imported)
  const markerRef = useRef<any>(null);

  // Keep refs up-to-date to avoid stale closures in the init effect
  const latRef = useRef(lat);
  const lonRef = useRef(lon);
  latRef.current = lat;
  lonRef.current = lon;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // ── Initialize map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;

      // Fix default icon URLs broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!).setView(
        [latRef.current, lonRef.current],
        zoom
      );
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([latRef.current, lonRef.current], {
        draggable: !!onPickRef.current,
      }).addTo(map);
      markerRef.current = marker;

      // Fix gray tiles caused by modal animation — invalidate after container settles
      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 250);

      // Also re-invalidate on container resize (e.g., orientation change, accordion)
      if (containerRef.current && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => { if (!destroyed) map.invalidateSize(); });
        ro.observe(containerRef.current);
        // Store for cleanup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Custom cleanup stored on Leaflet map instance
        (map as any)._roCleanup = () => ro.disconnect();
      }

      if (onPickRef.current) {
        const reverseGeocode = async (lat: number, lng: number) => {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`,
              { headers: { "Accept-Language": "es" } }
            );
            const data = await res.json();
            // Build a clean address label
            const a = data.address ?? {};
            const road = a.road ?? a.pedestrian ?? a.path ?? "";
            const num = a.house_number ? ` ${a.house_number}` : "";
            const city = a.city ?? a.town ?? a.village ?? "Pucallpa";
            const addr = road
              ? `${road}${num}, ${city} — GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
              : `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            onPickRef.current?.(lat, lng, addr);
          } catch {
            onPickRef.current?.(lat, lng, `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet event type
        map.on("click", (e: any) => {
          marker.setLatLng(e.latlng);
          reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          reverseGeocode(pos.lat, pos.lng);
        });
      }
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Custom cleanup on Leaflet map instance
        (mapRef.current as any)._roCleanup?.();
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync marker/view when lat/lon change from outside ─────────────────────
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lon]);
    mapRef.current.panTo([lat, lon]);
  }, [lat, lon]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%" }}
      className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100"
    />
  );
}
