"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/**
 * Mapa de operaciones EN VIVO (superadmin, Brandon 2026-06-19): tiendas (con
 * logo) + repartidores (posición GPS, color por online, inicial del vehículo) +
 * círculos de tráfico por zona. Crea el mapa UNA vez y actualiza los marcadores
 * sin recrearlo, para que el polling no resetee el zoom ni parpadee.
 */

export type MapStore = { slug: string; name: string; lat: number; lng: number; active: boolean; logoUrl: string | null };
export type MapRider = { id: string; name: string; lat: number; lng: number; isOnline: boolean; vehicleType: string; zone: string; lastPingAt: string | null; onDelivery: boolean };
export type MapZone = { zone: string; count: number; online: number; lat: number; lng: number };

interface Props {
  stores: MapStore[]; riders: MapRider[]; zones: MapZone[];
  showStores: boolean; showRiders: boolean; showZones: boolean;
  height?: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const vehInitial = (v: string) => (v === "bici" ? "B" : v === "auto" ? "A" : "M");

export default function LiveOpsMap({ stores, riders, zones, showStores, showRiders, showZones, height = 520 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet (dynamic import)
  const refs = useRef<{ map: any; L: any; storesL: any; ridersL: any; zonesL: any; didFit: boolean }>({ map: null, L: null, storesL: null, ridersL: null, zonesL: null, didFit: false });
  const data = useRef({ stores, riders, zones, showStores, showRiders, showZones });
  data.current = { stores, riders, zones, showStores, showRiders, showZones };

  // ── Crear el mapa una sola vez ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      const map = L.map(containerRef.current).setView([-8.38, -74.53], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      refs.current.map = map;
      refs.current.L = L;
      refs.current.zonesL = L.layerGroup().addTo(map);
      refs.current.storesL = L.layerGroup().addTo(map);
      refs.current.ridersL = L.layerGroup().addTo(map);
      setTimeout(() => { if (!destroyed) { map.invalidateSize(); render(); } }, 200);
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => { if (!destroyed) map.invalidateSize(); });
        ro.observe(containerRef.current);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._roCleanup = () => ro.disconnect();
      }
    });
    const r = refs.current;
    return () => {
      destroyed = true;
      if (r.map) { r.map._roCleanup?.(); r.map.remove(); r.map = null; }
    };
  }, []);

  // ── Redibujar marcadores cuando cambian los datos / capas ───────────────────
  function render() {
    const { map, L, storesL, ridersL, zonesL } = refs.current;
    if (!map || !L) return;
    const d = data.current;
    zonesL.clearLayers(); storesL.clearLayers(); ridersL.clearLayers();

    if (d.showZones) {
      const max = Math.max(1, ...d.zones.map((z) => z.count));
      for (const z of d.zones) {
        L.circle([z.lat, z.lng], { radius: 350 + (z.count / max) * 1400, color: "#00A0A0", weight: 1, fillColor: "#00A0A0", fillOpacity: 0.07 })
          .addTo(zonesL).bindTooltip(`${esc(z.zone)}: ${z.count} repartidor(es) · ${z.online} online`, { direction: "top" });
      }
    }
    if (d.showStores) {
      for (const s of d.stores) {
        const color = s.active ? "#00A0A0" : "#9ca3af";
        const html = s.logoUrl
          ? `<div style="width:30px;height:30px;border-radius:9999px;border:2px solid ${color};background:#fff url('${esc(s.logoUrl)}') center/cover no-repeat;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>`
          : `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`;
        L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html, iconSize: s.logoUrl ? [30, 30] : [16, 16], iconAnchor: s.logoUrl ? [15, 15] : [8, 8] }) })
          .addTo(storesL).bindPopup(`<strong>${esc(s.name)}</strong><br/>Tienda · ${s.active ? "activa" : "inactiva"}`);
      }
    }
    if (d.showRiders) {
      for (const r of d.riders) {
        const color = r.isOnline ? "#10b981" : "#9ca3af";
        const ring = r.isOnline ? "box-shadow:0 0 0 4px rgba(16,185,129,.25),0 1px 4px rgba(0,0,0,.4)" : "box-shadow:0 1px 4px rgba(0,0,0,.3)";
        const html = `<div style="width:22px;height:22px;border-radius:9999px;background:${color};border:2px solid #fff;${ring};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;font-family:sans-serif">${vehInitial(r.vehicleType)}</div>`;
        L.marker([r.lat, r.lng], { icon: L.divIcon({ className: "", html, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 })
          .addTo(ridersL).bindPopup(`<strong>${esc(r.name)}</strong><br/>${esc(r.zone)} · ${esc(r.vehicleType)}<br/>${r.isOnline ? "Online" : "Offline"}${r.onDelivery ? " · en entrega" : ""}`);
      }
    }

    if (!refs.current.didFit) {
      const all = [
        ...(d.showStores ? d.stores : []),
        ...(d.showRiders ? d.riders : []),
      ].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (all.length === 1) map.setView([all[0].lat, all[0].lng], 14);
      else if (all.length > 1) map.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng])).pad(0.25));
      if (all.length > 0) refs.current.didFit = true;
    }
  }

  useEffect(() => { render(); });

  return <div ref={containerRef} style={{ height, width: "100%" }} className="overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-sunken)]" />;
}
