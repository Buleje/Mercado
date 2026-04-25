"use client";

/**
 * TiendasMap — TS-04 vista mapa Leaflet del directorio /tiendas.
 *
 * Renderiza markers por tienda usando lat/lng (con fallback a ZONE_COORDS).
 * Click en marker → popup con nombre + rating + delivery + CTA "Ver tienda".
 *
 * Dynamic-imported de leaflet para evitar SSR. Se inicializa al montar y
 * se reusa el container en re-renders.
 *
 * Sprint 5 marketplace blueprint.
 */

import { useEffect, useRef } from "react";
import {
  ZONE_COORDS,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];
const DEFAULT_ZOOM = 12;

interface Props {
  stores: MarketplaceStore[];
  className?: string;
}

interface LeafletInstances {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markersLayer: any;
}

function getCoords(store: MarketplaceStore): [number, number] | null {
  if (typeof store.lat === "number" && typeof store.lng === "number") {
    return [store.lat, store.lng];
  }
  if (store.zone && ZONE_COORDS[store.zone]) {
    return ZONE_COORDS[store.zone];
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPopup(store: MarketplaceStore): string {
  const name = escapeHtml(store.name);
  const slug = encodeURIComponent(store.slug);
  const rating =
    store.rating > 0
      ? `<span style="font-weight:700;color:#111;">★ ${store.rating.toFixed(1)}</span>`
      : "";
  const reviews =
    store.reviewCount > 0
      ? `<span style="color:#6b7280;font-size:12px;">${store.reviewCount} reseñas</span>`
      : "";
  const delivery = store.deliveryMinutes
    ? `<span style="color:#6b7280;font-size:12px;">~${store.deliveryMinutes} min</span>`
    : "";
  const promos =
    store.activePromos && store.activePromos > 0
      ? `<span style="background:#fee2e2;color:#b91c1c;border-radius:9999px;padding:2px 8px;font-size:11px;font-weight:700;">${store.activePromos} ofertas</span>`
      : "";
  return `
    <div style="min-width:200px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="font-weight:800;font-size:14px;margin-bottom:4px;color:#111;">${name}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        ${rating}${reviews}${delivery}
      </div>
      ${promos ? `<div style="margin-bottom:8px;">${promos}</div>` : ""}
      <a href="/marketplace/${slug}" style="display:inline-block;background:#2d6a4f;color:#fff;border-radius:8px;padding:6px 12px;text-decoration:none;font-size:12px;font-weight:700;">Ver tienda</a>
    </div>
  `;
}

export default function TiendasMap({ stores, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<LeafletInstances | null>(null);
  const initRef = useRef(false);

  // Init map una vez
  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;
    let cancelled = false;

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

      const map = L.map(containerRef.current).setView(PUCALLPA_CENTER, DEFAULT_ZOOM);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      instancesRef.current = { map, markersLayer };

      setTimeout(() => map.invalidateSize(), 250);
    })();

    return () => {
      cancelled = true;
      if (instancesRef.current?.map) {
        instancesRef.current.map.remove();
      }
      instancesRef.current = null;
      initRef.current = false;
    };
  }, []);

  // Repintar markers cuando cambia la lista
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const inst = instancesRef.current;
      if (!inst) return;
      const L = await import("leaflet");
      if (cancelled) return;
      inst.markersLayer.clearLayers();
      const bounds: Array<[number, number]> = [];
      for (const s of stores) {
        const coords = getCoords(s);
        if (!coords) continue;
        bounds.push(coords);
        const marker = L.marker(coords).bindPopup(buildPopup(s));
        marker.addTo(inst.markersLayer);
      }
      if (bounds.length > 0) {
        try {
          inst.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        } catch {
          // ignorar — fitBounds puede fallar si no hay coords válidos
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stores]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Mapa interactivo de tiendas"
      className={className ?? "w-full h-[60vh] min-h-[400px] rounded-xl overflow-hidden border border-[var(--rule-soft)]"}
    />
  );
}
