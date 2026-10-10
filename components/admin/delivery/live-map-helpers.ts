/**
 * Lo que el mapa de repartidores en vivo necesita y no es React: el estado de
 * cada repartidor, sus colores y el HTML de sus marcadores (Leaflet arma los
 * marcadores con `innerHTML`, no con componentes).
 *
 * Sacado de `DeliveryPartnersLiveMap.tsx` el 10-10 para que el mapa quede en
 * menos de 300 líneas; mismo comportamiento.
 */
import type { DeliveryPartnerLive } from "@/components/admin/OrdersTab/hooks/useDeliveryPartnersLive";
import { toNum, vehicleKind } from "@/components/admin/delivery-partners/shared";
import { formatDateShort } from "@/lib/format";

export type PartnerState = "free" | "with-offer" | "busy" | "offline";

export function partnerStateOf(p: DeliveryPartnerLive): PartnerState {
  if (!p.isOnline) return "offline";
  if (p.currentOrderId) return "busy";
  if (p.pendingOffers > 0) return "with-offer";
  return "free";
}

/** Orden de la lista: primero quien lleva un pedido, después con oferta, libres y sin conexión. */
export const ORDEN_ESTADO: Record<PartnerState, number> = { busy: 0, "with-offer": 1, free: 2, offline: 3 };

/**
 * `mapColor` va dentro del HTML de Leaflet (no ve las variables CSS de la
 * página), por eso es un color fijo; la leyenda usa el mismo para que el punto
 * de la leyenda y el del mapa sean iguales.
 */
export const STATE_META: Record<PartnerState, { label: string; color: string; bg: string; mapColor: string }> = {
  free: {
    label: "Libre",
    color: "text-[var(--data-success-ink)]",
    bg: "bg-primary/10",
    mapColor: "#10b981",
  },
  "with-offer": {
    label: "Con oferta",
    color: "text-[var(--data-warning-ink)]",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15",
    mapColor: "#ff8676",
  },
  busy: {
    label: "Atendiendo",
    color: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
    bg: "bg-primary/10",
    mapColor: "#3b82f6",
  },
  offline: {
    label: "Sin conexión",
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--surface-sunken)]",
    mapColor: "#9ca3af",
  },
};

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return formatDateShort(iso);
}

// F1-XSS: todo texto del repartidor se escapa antes de ir al HTML de Leaflet.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Trazos de Lucide como texto (16 px, color heredado) para el marcador. */
function vehicleSvg(t: string): string {
  const k = vehicleKind(t);
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

export function markerHtml(p: DeliveryPartnerLive, elegido: boolean): string {
  const lado = elegido ? 32 : 26;
  const color = STATE_META[partnerStateOf(p)].mapColor;
  return `
    <div style="background:${color};width:${lado}px;height:${lado}px;border-radius:50%;border:${elegido ? 4 : 3}px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:white;transition:all 200ms;">
      ${vehicleSvg(p.vehicleType)}
    </div>
  `;
}

export function popupHtml(p: DeliveryPartnerLive): string {
  const rating = toNum(p.rating);
  const aceptacion = toNum(p.acceptanceRate);
  return `
    <div style="font-family:system-ui,sans-serif;min-width:180px;">
      <div style="font-weight:800;font-size:14px;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(p.name)}</div>
      <div style="font-size:14px;color:#555;margin-bottom:6px;">${escapeHtml(p.phone ?? "")}</div>
      <div style="display:flex;gap:6px;font-size:14px;color:#444;">
        <span>&#11088; ${rating.toFixed(1)}</span>
        <span>· ${Math.round(aceptacion * 100)}% aceptaci&#243;n</span>
      </div>
      ${p.currentOrderId ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#dbeafe;color:#1e40af;font-size:14px;font-weight:700;">Pedido ${escapeHtml(p.currentOrderId.slice(-8))}</div>` : ""}
      ${p.pendingOffers > 0 ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#fff1ef;color:#842e25;font-size:14px;font-weight:700;">${escapeHtml(String(p.pendingOffers))} ${p.pendingOffers === 1 ? "oferta pendiente" : "ofertas pendientes"}</div>` : ""}
      ${!p.currentOrderId && p.pendingOffers === 0 && p.isOnline ? `<div style="margin-top:6px;padding:4px 8px;border-radius:8px;background:#d1fae5;color:#065f46;font-size:14px;font-weight:700;">Libre y disponible</div>` : ""}
    </div>
  `;
}
