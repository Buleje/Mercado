"use client";

/**
 * DeliveryPartnersLiveMap — vista admin del tenant.
 *
 * Mapa Leaflet que muestra TODOS los partners online del tenant en
 * tiempo real (refresh cada 10s) + summary cards (total / online /
 * con offer / busy).
 *
 * Usa /api/admin/delivery/partners-live (auth admin del tenant).
 * Markers diferenciados por estado:
 *   - verde  → online + libre
 *   - ámbar  → online con offer pending
 *   - azul   → online + atendiendo pedido
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

interface Partner {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  isOnline: boolean;
  lat: number | null;
  lng: number | null;
  lastPingAt: string | null;
  currentOrderId: string | null;
  rating: number;
  acceptanceRate: number;
  pendingOffers: number;
  activeAssignment: { id: string; orderId: string; status: string; fee: number } | null;
}

interface Summary {
  total: number;
  online: number;
  withOffer: number;
  busy: number;
}

const REFRESH_MS = 10_000;
const PUCALLPA_LAT = -8.379;
const PUCALLPA_LNG = -74.553;

function partnerColor(p: Partner): string {
  if (p.currentOrderId) return "#3b82f6"; // blue — busy
  if (p.pendingOffers > 0) return "#fbbf24"; // amber — has offer
  if (p.isOnline) return "#10b981"; // green — free online
  return "#9ca3af"; // gray — offline
}

export default function DeliveryPartnersLiveMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const [partners, setPartners] = useState<Partner[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inicializar mapa una vez.
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
      const map = L.map(containerRef.current).setView([PUCALLPA_LAT, PUCALLPA_LNG], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, []);

  // Load + polling.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/delivery/partners-live", { credentials: "include" });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const data: { partners: Partner[]; summary: Summary } = await res.json();
        if (cancelled) return;
        setPartners(data.partners);
        setSummary(data.summary);
        setError(null);
      } catch {
        if (!cancelled) setError("Error de red");
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Render markers cuando cambian partners.
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      const seen = new Set<string>();
      partners.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        seen.add(p.id);
        const color = partnerColor(p);
        const html = `
          <div style="background:${color};width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:900;">
            ${p.vehicleType === "moto" ? "🛵" : p.vehicleType === "bicicleta" ? "🚲" : p.vehicleType === "auto" ? "🚗" : "👤"}
          </div>
        `;
        const icon = L.divIcon({ html, className: "", iconSize: [24, 24], iconAnchor: [12, 12] });
        const popupHtml = `
          <b>${p.name}</b><br/>
          📱 ${p.phone}<br/>
          ⭐ ${p.rating.toFixed(1)} · ${Math.round(p.acceptanceRate * 100)}% aceptación<br/>
          ${p.currentOrderId ? `🔵 Atendiendo pedido ${p.currentOrderId.slice(-8)}` : ""}
          ${p.pendingOffers > 0 ? `🟡 ${p.pendingOffers} oferta pending` : ""}
          ${!p.currentOrderId && p.pendingOffers === 0 ? "🟢 Libre" : ""}
        `;
        const existing = markersRef.current.get(p.id);
        if (existing) {
          existing.setLatLng([p.lat, p.lng]);
          existing.setIcon(icon);
          existing.setPopupContent(popupHtml);
        } else {
          const marker = L.marker([p.lat, p.lng], { icon })
            .addTo(mapRef.current)
            .bindPopup(popupHtml);
          markersRef.current.set(p.id, marker);
        }
      });
      // Eliminar markers que ya no están.
      markersRef.current.forEach((marker, id) => {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });
    });
  }, [partners]);

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total" value={summary.total} color="text-[var(--text-primary)]" />
          <SummaryCard label="En línea" value={summary.online} color="text-[var(--data-success)]" />
          <SummaryCard label="Con oferta" value={summary.withOffer} color="text-amber-600 dark:text-amber-400" />
          <SummaryCard label="Atendiendo" value={summary.busy} color="text-[var(--accent)]" />
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border-2 border-[var(--rule-base)] overflow-hidden bg-[var(--surface-raised)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-base)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Repartidores en tiempo real
          </h3>
          <span className="text-xs text-[var(--text-tertiary)]">Actualiza cada 10s</span>
        </div>
        <div ref={containerRef} className="w-full h-[500px]" />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
        <Legend color="bg-[var(--data-success)]" label="Libre" />
        <Legend color="bg-amber-400" label="Con oferta" />
        <Legend color="bg-blue-500" label="Atendiendo pedido" />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-full ${color} ring-2 ring-white dark:ring-[var(--surface-canvas)]`}></span>
      {label}
    </span>
  );
}
