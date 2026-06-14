"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/**
 * Mapa multi-marcador de tiendas (superadmin, Brandon 2026-06-14). Plotea cada
 * tienda con coordenadas; popup con nombre + color por estado. fitBounds para
 * encuadrar todas. Carga Leaflet dinámicamente (mismo patrón que LeafletMap).
 */

export type MapTenant = { slug: string; name: string; lat: number; lng: number; active: boolean };

export default function TenantsMap({ tenants, height = 480 }: { tenants: MapTenant[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet map instance (dynamic import)
  const mapRef = useRef<any>(null);
  const tenantsRef = useRef(tenants);
  tenantsRef.current = tenants;

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Centro inicial: Pucallpa/Selva Central (fallback si no hay tiendas).
      const map = L.map(containerRef.current!).setView([-8.38, -74.53], 6);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const located = tenantsRef.current.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng));
      const markers = located.map((t) => {
        const color = t.active ? "#00A0A0" : "#9ca3af";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        return L.marker([t.lat, t.lng], { icon }).addTo(map).bindPopup(`<strong>${t.name}</strong><br/>${t.active ? "Activa" : "Inactiva"}`);
      });

      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 250);
      if (markers.length === 1) map.setView(markers[0].getLatLng(), 14);
      else if (markers.length > 1) {
        map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
      }

      if (containerRef.current && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => { if (!destroyed) map.invalidateSize(); });
        ro.observe(containerRef.current);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._roCleanup = () => ro.disconnect();
      }
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any)._roCleanup?.();
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants]);

  return <div ref={containerRef} style={{ height, width: "100%" }} className="overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-sunken)]" />;
}
