"use client";

/**
 * DeliveryPartnersLiveMap — vista admin del tenant.
 *
 * Mapa Leaflet que muestra TODOS los partners online del tenant en
 * tiempo real (refresh cada 10s) + summary cards (total / online /
 * con offer / busy) + lista lateral de partners.
 *
 * Usa /api/admin/delivery/partners-live (auth admin del tenant).
 * Markers diferenciados por estado:
 *   - verde  → online + libre
 *   - ámbar  → online con offer pending
 *   - azul   → online + atendiendo pedido
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  MapPin,
  Truck,
  RefreshCw,
  AlertCircle,
  Phone,
  Star,
  CheckCircle,
  Clock,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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
  rating: number | string;
  acceptanceRate: number | string;
  pendingOffers: number;
  activeAssignment: { id: string; orderId: string; status: string; fee: number | string } | null;
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

/** Convierte cualquier valor numérico que pueda venir como string (Prisma Decimal) a number seguro. */
function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

type PartnerState = "free" | "with-offer" | "busy" | "offline";

function partnerStateOf(p: Partner): PartnerState {
  if (!p.isOnline) return "offline";
  if (p.currentOrderId) return "busy";
  if (p.pendingOffers > 0) return "with-offer";
  return "free";
}

const STATE_META: Record<
  PartnerState,
  { label: string; color: string; bg: string; mapColor: string }
> = {
  free: {
    label: "Libre",
    color: "text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)]",
    mapColor: "#10b981",
  },
  "with-offer": {
    label: "Con oferta",
    color: "text-[var(--data-warning-600)]",
    bg: "bg-[var(--data-warning-50)]",
    mapColor: "#fbbf24",
  },
  busy: {
    label: "Atendiendo",
    color: "text-[var(--accent)]",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    mapColor: "#3b82f6",
  },
  offline: {
    label: "Offline",
    color: "text-[var(--text-tertiary)]",
    bg: "bg-[var(--surface-sunken)]",
    mapColor: "#9ca3af",
  },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function vehicleEmoji(t: string): string {
  const v = (t ?? "").toLowerCase();
  if (v.includes("moto")) return "🛵";
  if (v.includes("bici")) return "🚲";
  if (v.includes("auto") || v.includes("car")) return "🚗";
  if (v.includes("pie")) return "🚶";
  return "👤";
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Inicializar mapa una vez
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    void import("leaflet/dist/leaflet.css");

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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/delivery/partners-live", {
        credentials: "include",
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data: { partners: Partner[]; summary: Summary } = await res.json();
      setPartners(data.partners);
      setSummary(data.summary);
      setError(null);
      setLastUpdate(new Date());
    } catch {
      setError("Error de red — verificá tu conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load + polling
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void load({ silent: true });
    };
    void load();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load]);

  // Render markers cuando cambian partners
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      const seen = new Set<string>();
      partners.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        seen.add(p.id);
        const state = partnerStateOf(p);
        const color = STATE_META[state].mapColor;
        const isSelected = selectedId === p.id;
        const html = `
          <div style="background:${color};width:${isSelected ? 32 : 26}px;height:${isSelected ? 32 : 26}px;border-radius:50%;border:${isSelected ? 4 : 3}px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:${isSelected ? 16 : 13}px;transition:all 200ms;">
            ${vehicleEmoji(p.vehicleType)}
          </div>
        `;
        const icon = L.divIcon({
          html,
          className: "",
          iconSize: [isSelected ? 32 : 26, isSelected ? 32 : 26],
          iconAnchor: [isSelected ? 16 : 13, isSelected ? 16 : 13],
        });
        const ratingNum = toNum(p.rating);
        const accNum = toNum(p.acceptanceRate);
        const popupHtml = `
          <div style="font-family:system-ui,sans-serif;min-width:180px;">
            <div style="font-weight:800;font-size:14px;color:#1a1a1a;margin-bottom:4px;">${p.name}</div>
            <div style="font-size:12px;color:#666;margin-bottom:6px;">${p.phone}</div>
            <div style="display:flex;gap:6px;font-size:12px;color:#444;">
              <span>⭐ ${ratingNum.toFixed(1)}</span>
              <span>· ${Math.round(accNum * 100)}% aceptación</span>
            </div>
            ${p.currentOrderId ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:700;">🔵 Pedido ${p.currentOrderId.slice(-8)}</div>` : ""}
            ${p.pendingOffers > 0 ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;">🟡 ${p.pendingOffers} oferta pending</div>` : ""}
            ${!p.currentOrderId && p.pendingOffers === 0 && p.isOnline ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;">🟢 Libre y disponible</div>` : ""}
          </div>
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
          marker.on("click", () => setSelectedId(p.id));
          markersRef.current.set(p.id, marker);
        }
      });
      markersRef.current.forEach((marker, id) => {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });
    });
  }, [partners, selectedId]);

  const focusPartner = (p: Partner) => {
    setSelectedId(p.id);
    if (mapRef.current && p.lat != null && p.lng != null) {
      mapRef.current.flyTo([p.lat, p.lng], 15, { duration: 0.7 });
      const marker = markersRef.current.get(p.id);
      if (marker) marker.openPopup();
    }
  };

  const sortedPartners = [...partners].sort((a, b) => {
    // Online first, then by state priority
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    const order: Record<PartnerState, number> = {
      busy: 0,
      "with-offer": 1,
      free: 2,
      offline: 3,
    };
    return order[partnerStateOf(a)] - order[partnerStateOf(b)];
  });

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <MapPin className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Repartidores en vivo
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {loading
                  ? "Cargando ubicaciones..."
                  : !summary || summary.total === 0
                    ? "Aún no hay repartidores registrados. Agregá uno desde la pestaña Repartidores."
                    : `${summary.online} de ${summary.total} ${summary.total === 1 ? "repartidor" : "repartidores"} en línea · auto-refresh cada 10s${lastUpdate ? ` · última: ${timeAgo(lastUpdate.toISOString())}` : ""}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Actualizando..." : "Actualizar ahora"}
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Total registrados
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                {summary.total}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">En tu tenant</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
                {summary.online > 0 && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500)] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--data-success-500)]" />
                  </span>
                )}
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                En línea
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {summary.online}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Disponibles ahora</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-50)]">
                  <Clock className="h-5 w-5 text-[var(--data-warning-600)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Con oferta
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-warning-600)] leading-tight mt-2">
                {summary.withOffer}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Esperando confirmar
              </p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                  <Truck className="h-5 w-5 text-[var(--accent)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Atendiendo
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--accent)] leading-tight mt-2">
                {summary.busy}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Con pedido en curso
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Banner error ─────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-error-500)]/15 shrink-0">
            <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
          </span>
          <p className="text-sm font-bold text-[var(--data-error-500)] flex-1">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm font-bold text-[var(--data-error-500)] underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── 3. Mapa + Lista lateral ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Mapa */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-6 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <MapPin className="h-4.5 w-4.5" />
              </span>
              <div>
                <CardTitle className="font-display text-base leading-tight">
                  Mapa en tiempo real
                </CardTitle>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  Click en un marker para ver detalle del repartidor
                </p>
              </div>
            </div>
            {/* Leyenda integrada */}
            <div className="flex flex-wrap items-center gap-3">
              {(["free", "with-offer", "busy"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                  <span
                    className="inline-block h-3 w-3 rounded-full ring-2 ring-white dark:ring-[var(--surface-canvas)]"
                    style={{ backgroundColor: STATE_META[s].mapColor }}
                  />
                  {STATE_META[s].label}
                </span>
              ))}
            </div>
          </div>
          <div ref={containerRef} className="w-full min-w-0 h-[560px]" />
        </div>

        {/* Lista lateral */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm flex flex-col max-h-[calc(560px+88px)]">
          <div className="px-5 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Truck className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="font-display text-base leading-tight">
                  Repartidores
                </CardTitle>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  Click para enfocar en el mapa
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-[var(--surface-sunken)] text-[var(--text-tertiary)] tabular-nums shrink-0">
              {sortedPartners.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sortedPartners.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-3">
                  <Truck className="h-6 w-6 text-[var(--text-tertiary)]" />
                </span>
                <p className="text-base font-extrabold text-[var(--text-primary)]">
                  Sin repartidores
                </p>
                <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-relaxed">
                  {loading
                    ? "Cargando..."
                    : "Agregá repartidores desde la pestaña Repartidores"}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rule-soft)]">
                {sortedPartners.map((p) => {
                  const state = partnerStateOf(p);
                  const meta = STATE_META[state];
                  const isSelected = selectedId === p.id;
                  const ratingNum = toNum(p.rating);
                  const hasLocation = p.lat != null && p.lng != null;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => focusPartner(p)}
                        disabled={!hasLocation}
                        className={cn(
                          "w-full text-left px-5 py-4 transition-colors flex items-start gap-3",
                          isSelected
                            ? "bg-primary/5"
                            : "hover:bg-[var(--surface-sunken)]",
                          !hasLocation && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <div
                          className={cn(
                            "h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0",
                            meta.bg,
                          )}
                        >
                          {vehicleEmoji(p.vehicleType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                              {p.name}
                            </p>
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold", meta.bg, meta.color)}>
                              {meta.label}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5 flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {p.phone}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--text-secondary)]">
                            <span className="inline-flex items-center gap-1 font-bold">
                              <Star className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                              {ratingNum.toFixed(1)}
                            </span>
                            {p.lastPingAt && (
                              <span className="text-[var(--text-tertiary)]">
                                {timeAgo(p.lastPingAt)}
                              </span>
                            )}
                            {!hasLocation && (
                              <span className="text-[var(--data-error-500)] font-bold">
                                Sin GPS
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
