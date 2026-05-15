"use client";

/**
 * OrderLocationMap — mini mapa Leaflet con dos pins:
 *   1. Origen: el restaurante/tienda que despacha (usa Store.lat/lng cuando
 *      existe; cae a geocoding por nombre+zona si falta).
 *   2. Destino: la dirección del cliente (geocoding jerárquico usando
 *      línea + distrito + provincia + departamento del snapshot).
 *
 * Bug fix histórico: antes el geocoding forzaba "Pucallpa" como fallback
 * cuando no había `district`, lo que arrastraba pedidos de otras ciudades
 * (ej. "Ciudad Constitución, Oxapampa, Pasco") a Pucallpa en el mapa.
 * Ahora usamos toda la jerarquía territorial real del address y solo
 * caemos al centro neutro de Perú si nada se resolvió.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";

interface StoreInfo {
  slug: string;
  name: string;
}

interface Props {
  address: {
    line: string;
    district?: string;
    province?: string;
    department?: string;
  };
  stores?: StoreInfo[];
  className?: string;
}

const PERU_CENTER: [number, number] = [-9.19, -75.0152];

interface ApiStoreLocation {
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
  zone: string | null;
}

async function geocode(
  query: string,
  signal: AbortSignal,
): Promise<[number, number] | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=pe`,
    { signal },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data?.[0]) return null;
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

function buildDestQuery(address: Props["address"]): string {
  return [address.line, address.district, address.province, address.department, "Perú"]
    .filter(Boolean)
    .join(", ");
}

export default function OrderLocationMap({ address, stores, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [destFound, setDestFound] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let mapInstance: import("leaflet").Map | null = null;
    const ctrl = new AbortController();
    const timeoutId = window.setTimeout(() => ctrl.abort(), 5000);

    (async () => {
      await import("leaflet/dist/leaflet.css");
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      // Iconos custom (inline SVG → dataURL) — destino (rojo) y origen (verde).
      const destIcon = L.divIcon({
        className: "order-map-pin",
        html: `<div style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
          <svg width="38" height="46" viewBox="0 0 38 46" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 0C8.5 0 0 8.3 0 18.6c0 13.6 19 27.4 19 27.4s19-13.8 19-27.4C38 8.3 29.5 0 19 0z" fill="#E11D48"/>
            <circle cx="19" cy="18" r="7" fill="white"/>
            <circle cx="19" cy="18" r="3" fill="#E11D48"/>
          </svg>
        </div>`,
        iconSize: [38, 46],
        iconAnchor: [19, 46],
        popupAnchor: [0, -42],
      });

      const originIcon = L.divIcon({
        className: "order-map-pin",
        html: `<div style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
          <svg width="38" height="46" viewBox="0 0 38 46" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 0C8.5 0 0 8.3 0 18.6c0 13.6 19 27.4 19 27.4s19-13.8 19-27.4C38 8.3 29.5 0 19 0z" fill="#059669"/>
            <g transform="translate(8 8)" fill="white">
              <path d="M3 4h16v2H3zm0 4h16v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm4 3v6h2v-6H7zm6 0v6h2v-6h-2z"/>
            </g>
          </svg>
        </div>`,
        iconSize: [38, 46],
        iconAnchor: [19, 46],
        popupAnchor: [0, -42],
      });

      // ── 1. Geocoding del destino (cliente) ──────────────
      let destCoords: [number, number] | null = null;
      try {
        destCoords = await geocode(buildDestQuery(address), ctrl.signal);
      } catch {
        /* silent */
      }

      // ── 2. Resolver origen (tienda) ─────────────────────
      const origins: Array<{ name: string; coords: [number, number] }> = [];
      if (stores && stores.length > 0) {
        try {
          const slugs = stores
            .map((s) => s.slug)
            .filter(Boolean)
            .slice(0, 5)
            .join(",");
          if (slugs) {
            const res = await fetch(
              `/api/marketplace/storefront/locations?stores=${slugs}`,
              { signal: ctrl.signal },
            );
            if (res.ok) {
              const data = (await res.json()) as { stores: ApiStoreLocation[] };
              for (const s of data.stores) {
                if (typeof s.lat === "number" && typeof s.lng === "number") {
                  origins.push({ name: s.name, coords: [s.lat, s.lng] });
                } else {
                  // Fallback geocoding por nombre + zone + ciudad del destino.
                  try {
                    const region =
                      s.zone || address.district || address.province || address.department || "Perú";
                    const coords = await geocode(`${s.name}, ${region}, Perú`, ctrl.signal);
                    if (coords) origins.push({ name: s.name, coords });
                  } catch {
                    /* silent */
                  }
                }
              }
            }
          }
        } catch {
          /* silent */
        }
      }

      window.clearTimeout(timeoutId);
      if (cancelled || !containerRef.current) return;

      // ── 3. Inicializar mapa con centro razonable ────────
      const initialCenter: [number, number] =
        destCoords ?? origins[0]?.coords ?? PERU_CENTER;
      const initialZoom = destCoords || origins.length > 0 ? 14 : 6;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
        attributionControl: false,
      }).setView(initialCenter, initialZoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const markers: import("leaflet").Marker[] = [];

      // Origen(es)
      for (const o of origins) {
        const m = L.marker(o.coords, { icon: originIcon }).addTo(map);
        m.bindPopup(
          `<div style="font-weight:700;color:#059669">Sale desde</div><div style="margin-top:2px;color:#525252">${o.name}</div>`,
          { closeButton: false },
        );
        markers.push(m);
      }

      // Destino
      if (destCoords) {
        const m = L.marker(destCoords, { icon: destIcon }).addTo(map);
        m.bindPopup(
          `<div style="font-weight:700;color:#E11D48">Tu entrega</div><div style="margin-top:2px;color:#525252">${address.line}</div>`,
          { closeButton: false },
        ).openPopup();
        markers.push(m);
      }

      // Línea punteada entre origen y destino (si tengo ambos)
      if (destCoords && origins.length > 0) {
        L.polyline([origins[0].coords, destCoords], {
          color: "#737373",
          weight: 2,
          dashArray: "6 6",
          opacity: 0.75,
        }).addTo(map);
      }

      // Encadrar ambos pins si hay >= 2
      if (markers.length >= 2) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 16 });
      } else if (markers.length === 1) {
        map.setView(markers[0].getLatLng(), 15);
      }

      mapInstance = map;
      setDestFound(Boolean(destCoords));
      setLoading(false);

      window.setTimeout(() => map.invalidateSize(), 300);
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timeoutId);
      if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
      }
    };
  }, [address, stores]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        ref={containerRef}
        className="w-full h-full rounded-2xl overflow-hidden bg-[var(--surface-sunken)]"
        aria-label="Mapa con origen y destino del pedido"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
        </div>
      )}
      {!loading && !destFound && (
        <div className="absolute bottom-2 left-2 right-2 rounded-xl bg-[var(--surface-canvas)]/95 backdrop-blur px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-md">
          No pudimos ubicar la dirección en el mapa — revisa la referencia abajo.
        </div>
      )}
    </div>
  );
}
