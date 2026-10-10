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

import { useEffect, useRef, useState } from "react";
import { CardTitle, SectionTitle, StatCard } from "@buleje/design-system";
import {
  MapPin,
  Truck,
  RefreshCw,
  AlertCircle,
  Phone,
  Star,
  CheckCircle,
  Clock,
  Bike,
  Car,
  Footprints,
  Users,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { EmptyState } from "@/components/admin/EmptyState";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  useDeliveryPartnersLive,
  type DeliveryPartnerLive,
  type DeliveryPartnersSummary,
} from "@/components/admin/OrdersTab/hooks/useDeliveryPartnersLive";
import { formatDateShort } from "@/lib/format";

// F1-XSS: helper modulo-level para escapar HTML antes de interpolar en Leaflet divIcon/bindPopup
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type Partner = DeliveryPartnerLive;
type Summary = DeliveryPartnersSummary;

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
    bg: "bg-primary/10",
    mapColor: "#10b981",
  },
  "with-offer": {
    label: "Con oferta",
    color: "text-[var(--data-warning-600)]",
    bg: "bg-[var(--data-warning-50)]",
    mapColor: "#ff8676",
  },
  busy: {
    label: "Atendiendo",
    color: "text-primary",
    bg: "bg-primary/10",
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
  return formatDateShort(iso);
}

/**
 * Brandon mayo 2026 v7: reemplazado vehicleEmoji() por VehicleIcon
 * componente Lucide (CLAUDE.md prohíbe emojis genéricos en UI).
 * Para los popups de Leaflet (que se construyen vía innerHTML) seguimos
 * usando SVG inline minimal — Leaflet no acepta componentes React.
 */
function vehicleKind(t: string): "moto" | "bici" | "auto" | "pie" | "otro" {
  const v = (t ?? "").toLowerCase();
  if (v.includes("moto")) return "moto";
  if (v.includes("bici")) return "bici";
  if (v.includes("auto") || v.includes("car")) return "auto";
  if (v.includes("pie")) return "pie";
  return "otro";
}

function VehicleIcon({ type, className = "h-5 w-5" }: { type: string; className?: string }) {
  const k = vehicleKind(type);
  if (k === "moto") return <Truck className={className} aria-label="Moto" />;
  if (k === "bici") return <Bike className={className} aria-label="Bicicleta" />;
  if (k === "auto") return <Car className={className} aria-label="Auto" />;
  if (k === "pie")  return <Footprints className={className} aria-label="A pie" />;
  return <Users className={className} aria-label="Vehículo" />;
}

/**
 * SVG-string inline para los markers de Leaflet (innerHTML).
 * Trazos de lucide-react exportados como string para evitar @vercel/icons.
 */
function vehicleSvg(t: string): string {
  const k = vehicleKind(t);
  // 16x16 trazo blanco — color heredado del contenedor (currentColor).
  const stroke = `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  if (k === "moto") {
    return `<svg viewBox="0 0 24 24" width="16" height="16" ${stroke}><path d="M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M14 17h-4l-2-4 4-4 5 3 1 5"/><path d="M14 6h3"/></svg>`;
  }
  if (k === "bici") {
    return `<svg viewBox="0 0 24 24" width="16" height="16" ${stroke}><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
  }
  if (k === "auto") {
    return `<svg viewBox="0 0 24 24" width="16" height="16" ${stroke}><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`;
  }
  if (k === "pie") {
    return `<svg viewBox="0 0 24 24" width="16" height="16" ${stroke}><path d="M4 16v-2.4a3 3 0 0 1 1.7-2.7l4.1-2.4a3 3 0 0 1 4.5 2.7V16"/><path d="M8 22v-4"/><path d="M16 22v-4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="16" height="16" ${stroke}><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></svg>`;
}

export default function DeliveryPartnersLiveMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  // El mismo hook que el despacho del pedido (un solo fetch de repartidores en
  // vivo, plan «panel unificado» 2026-10-09); acá se refresca cada 10 s.
  const { partners, summary: resumen, loading, refreshing, error, lastUpdate, refresh } =
    useDeliveryPartnersLive({ intervaloMs: REFRESH_MS });
  // Sin respuesta buena todavía, no hay resumen que mostrar (como antes).
  const summary: Summary | null = lastUpdate ? resumen : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Inicializar mapa una vez
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    void import("leaflet/dist/leaflet.css");

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      // FIX 2026-05-06: NO mergeOptions con unpkg.com — usamos divIcon
      // custom abajo, los iconos default de Leaflet nunca se renderizan.
      // Si CSP bloquea unpkg o se queda offline, el mapa se rompe innecesariamente.
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

  // Render markers cuando cambian partners
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const seen = new Set<string>();
      partners.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        seen.add(p.id);
        const state = partnerStateOf(p);
        const color = STATE_META[state].mapColor;
        const isSelected = selectedId === p.id;
        const html = `
          <div style="background:${color};width:${isSelected ? 32 : 26}px;height:${isSelected ? 32 : 26}px;border-radius:50%;border:${isSelected ? 4 : 3}px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:white;transition:all 200ms;">
            ${vehicleSvg(p.vehicleType)}
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
            <div style="font-weight:800;font-size:14px;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(p.name)}</div>
            <div style="font-size:12px;color:#666;margin-bottom:6px;">${escapeHtml(p.phone ?? "")}</div>
            <div style="display:flex;gap:6px;font-size:12px;color:#444;">
              <span>&#11088; ${ratingNum.toFixed(1)}</span>
              <span>· ${Math.round(accNum * 100)}% aceptaci&#243;n</span>
            </div>
            ${p.currentOrderId ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:700;">Pedido ${escapeHtml(p.currentOrderId.slice(-8))}</div>` : ""}
            ${p.pendingOffers > 0 ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#fff1ef;color:#842e25;font-size:11px;font-weight:700;">${escapeHtml(String(p.pendingOffers))} ${p.pendingOffers === 1 ? "oferta pendiente" : "ofertas pendientes"}</div>` : ""}
            ${!p.currentOrderId && p.pendingOffers === 0 && p.isOnline ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;">Libre y disponible</div>` : ""}
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
    return () => { cancelled = true; };
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
      {/* ── 1. Título de la vista + cifras en vivo ───────────────────
          Una vista = un título (SectionTitle); lo que explica, en el ⓘ; las
          cuatro cifras son StatCard del DS (antes, tarjetas hechas a mano en
          MAYÚSCULAS). */}
      <section className="space-y-3" aria-labelledby="reparto-en-vivo-titulo">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <SectionTitle id="reparto-en-vivo-titulo">Repartidores en vivo</SectionTitle>
              <InfoTip
                title="Repartidores en vivo"
                what="Dónde está cada repartidor y qué está haciendo, al momento."
                affects="Se actualiza sola cada 10 s; «Actualizar ahora» no espera a la próxima vuelta."
                example="«1 de 3 en línea»: uno tiene la app abierta; los otros dos, no."
              />
            </div>
            <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
              {loading
                ? "Cargando ubicaciones…"
                : !summary || summary.total === 0
                  ? "Todavía no hay repartidores: agrégalos en Repartidores."
                  : `${summary.online} de ${summary.total} ${summary.total === 1 ? "repartidor" : "repartidores"} en línea${lastUpdate ? ` · última: ${timeAgo(lastUpdate.toISOString())}` : ""}`}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            title="Actualizar ahora"
            // En el celular queda el ícono (48 px): con el texto, el título se
            // partía en dos líneas y el botón le comía media fila (ley 6).
            className={button({ variant: "accent", className: "rounded-xl max-sm:w-12 max-sm:px-0" })}
          >
            {refreshing ? <LoadingSpinner size={16} /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            <span className="max-sm:sr-only">{refreshing ? "Actualizando…" : "Actualizar ahora"}</span>
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Registrados" value={summary.total} subValue="En tu negocio" icon={Truck} density="compact" />
            <StatCard
              label="En línea"
              value={summary.online}
              subValue="Disponibles ahora"
              icon={CheckCircle}
              density="compact"
              emphasis={summary.online > 0 ? "success" : undefined}
            />
            <StatCard
              label="Con oferta"
              value={summary.withOffer}
              subValue="Esperando confirmar"
              icon={Clock}
              density="compact"
              emphasis={summary.withOffer > 0 ? "warning" : undefined}
            />
            <StatCard label="Atendiendo" value={summary.busy} subValue="Con pedido en curso" icon={Users} density="compact" />
          </div>
        )}
      </section>

      {/* ── 2. Banner error ─────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-4 dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
          <p className="flex-1 py-3 text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="h-12 px-2 text-sm font-bold text-[var(--data-error-ink)] underline hover:no-underline"
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
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
                <MapPin className="h-4.5 w-4.5" />
              </span>
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-bold leading-tight">Mapa en tiempo real</CardTitle>
                <InfoTip
                  title="Mapa en tiempo real"
                  what="Cada punto es un repartidor con GPS, del color de su estado."
                  affects="Toca un punto para ver su teléfono, su calificación y el pedido que lleva."
                />
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
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
                <Truck className="h-4 w-4" />
              </span>
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-bold leading-tight">Repartidores</CardTitle>
                <InfoTip
                  title="Repartidores"
                  what="Primero los que están en línea; después, por lo que están haciendo."
                  affects="Toca uno para centrar el mapa en él. «Sin GPS»: la app no mandó su ubicación."
                />
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-[var(--surface-sunken)] text-[var(--text-tertiary)] tabular-nums shrink-0">
              {sortedPartners.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sortedPartners.length === 0 ? (
              loading ? (
                <LoadingSpinner size={32} className="mx-auto my-12" />
              ) : (
                <EmptyState
                  icon={<Truck className="h-10 w-10 text-[var(--text-tertiary)]" />}
                  title="Todavía no tienes repartidores"
                  description="Agrégalos en la sección Repartidores."
                  actions={[]}
                />
              )
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
                            "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                            meta.bg,
                            meta.color,
                          )}
                        >
                          <VehicleIcon type={p.vehicleType} className="h-5 w-5" />
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
                              <span className="text-[var(--data-error-ink)] font-bold">
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
