"use client";

/**
 * PartnerMap — mapa Leaflet con:
 *  - Posición real del partner (auto-refresh por el shell)
 *  - Tiendas (Store) del tenant con su logo + heat (frecuencia 30d real)
 *  - Ofertas pendientes con coords reales del pedido cuando existan
 *
 * Brandon mayo 2026 v7: refactor — antes los offers se pintaban con offset
 * hash del partner (decorativo). Ahora si la order tiene coords reales las
 * usa; si no, intenta geocoder de Pucallpa centro como fallback honesto y
 * marca el pin como "ubicación aproximada".
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Offer {
  id: string;
  distanceKm: number;
  feeOffered: number;
  expiresAt: string;
  lat?: number | null;
  lng?: number | null;
  order: {
    customerName: string;
    customerLocation: string | null;
  };
}

interface NearbyStore {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  lat: number;
  lng: number;
  deliveriesLast30d: number;
  heat: "high" | "medium" | "low";
  rating: number;
  reviewCount: number;
}

interface Props {
  partnerLat: number;
  partnerLng: number;
}

const REFRESH_MS = 15_000;
const STORES_REFRESH_MS = 120_000; // 2 min

const HEAT_COLOR: Record<NearbyStore["heat"], string> = {
  high: "#dc2626", // rojo: alta demanda
  medium: "#d97706", // naranja: media
  low: "#737373", // gris: baja
};

const HEAT_LABEL: Record<NearbyStore["heat"], string> = {
  high: "Alta demanda",
  medium: "Demanda media",
  low: "Baja demanda",
};

export default function PartnerMap({ partnerLat, partnerLng }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerMarkersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeMarkersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerMarkerRef = useRef<any>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const prevOffersHashRef = useRef<string>("");
  const prevStoresHashRef = useRef<string>("");

  // ── Inicializar mapa ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current).setView(
        [partnerLat, partnerLng],
        14,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      // Marker partner — punto plano color brand
      const partnerIcon = L.divIcon({
        html: `<div style="background:#00A0A0;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);"></div>`,
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      partnerMarkerRef.current = L.marker([partnerLat, partnerLng], {
        icon: partnerIcon,
        zIndexOffset: 1000,
      })
        .addTo(map)
        .bindPopup("<b>Tu ubicación</b>");

      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [partnerLat, partnerLng]);

  // Actualizar marker partner.
  useEffect(() => {
    if (partnerMarkerRef.current) {
      partnerMarkerRef.current.setLatLng([partnerLat, partnerLng]);
    }
  }, [partnerLat, partnerLng]);

  // ── Polling offers ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/delivery/me/offers", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: { offers: Offer[] } = await res.json();
        if (cancelled) return;
        const hash = JSON.stringify(data.offers);
        if (hash !== prevOffersHashRef.current) {
          prevOffersHashRef.current = hash;
          setOffers(data.offers);
        }
      } catch {
        /* silent */
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Polling stores (frecuencia 30d) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/delivery/me/nearby-stores", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: { stores: NearbyStore[] } = await res.json();
        if (cancelled) return;
        const hash = JSON.stringify(data.stores);
        if (hash !== prevStoresHashRef.current) {
          prevStoresHashRef.current = hash;
          setStores(data.stores);
        }
      } catch {
        /* silent */
      }
    };
    load();
    const id = setInterval(load, STORES_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Render markers de tiendas ───────────────────────────────────────────
  const renderStoreMarkers = useCallback(async () => {
    if (!mapRef.current) return;
    const L = await import("leaflet");
    storeMarkersRef.current.forEach((m) => m.remove());
    storeMarkersRef.current = [];

    stores.forEach((store) => {
      const ringColor = HEAT_COLOR[store.heat];
      const logoSrc = store.logo
        ? store.logo
        : null;
      // Marker = círculo con logo dentro + ring de color heat
      const html = logoSrc
        ? `<div style="position:relative;width:44px;height:44px;">
             <div style="width:44px;height:44px;border-radius:50%;border:3px solid ${ringColor};background:white;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.25);">
               <img src="${logoSrc}" alt="" style="width:100%;height:100%;object-fit:cover;" referrerpolicy="no-referrer" onerror="this.style.display='none'"/>
             </div>
             ${store.deliveriesLast30d > 0 ? `<span style="position:absolute;bottom:-2px;right:-2px;background:${ringColor};color:white;font-weight:800;font-size:10px;border-radius:9999px;padding:2px 6px;border:2px solid white;line-height:1;">${store.deliveriesLast30d}</span>` : ""}
           </div>`
        : `<div style="width:40px;height:40px;border-radius:50%;border:3px solid ${ringColor};background:white;color:${ringColor};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.25);">${store.name.slice(0, 1).toUpperCase()}</div>`;

      const icon = L.divIcon({
        html,
        className: "",
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker([store.lat, store.lng], { icon }).addTo(
        mapRef.current,
      );
      const ratingTxt = store.rating > 0
        ? ` · ★ ${store.rating.toFixed(1)} (${store.reviewCount})`
        : "";
      marker.bindPopup(
        `<b>${escapeHtml(store.name)}</b>${ratingTxt}<br/>` +
          `<span style="color:${ringColor};font-weight:bold">${HEAT_LABEL[store.heat]}</span><br/>` +
          `${store.deliveriesLast30d} entrega${store.deliveriesLast30d === 1 ? "" : "s"} en 30 días`,
      );
      storeMarkersRef.current.push(marker);
    });
  }, [stores]);

  useEffect(() => {
    void renderStoreMarkers();
  }, [renderStoreMarkers]);

  // ── Render markers de ofertas ───────────────────────────────────────────
  const renderOfferMarkers = useCallback(async () => {
    if (!mapRef.current) return;
    const L = await import("leaflet");
    offerMarkersRef.current.forEach((m) => m.remove());
    offerMarkersRef.current = [];

    offers.forEach((offer) => {
      // Brandon mayo 2026 v7: si la oferta tiene coords reales, usarlas. Si
      // no, NO inventamos hash offset — caemos al centro de Pucallpa con un
      // dash style que indica "ubicación aproximada".
      const hasRealCoords =
        typeof offer.lat === "number" &&
        typeof offer.lng === "number" &&
        Number.isFinite(offer.lat) &&
        Number.isFinite(offer.lng);
      const lat = hasRealCoords ? (offer.lat as number) : -8.38013;
      const lng = hasRealCoords ? (offer.lng as number) : -74.53553;

      const dashed = hasRealCoords ? "" : "border-style:dashed;";
      const icon = L.divIcon({
        html: `<div style="background:#fbbf24;color:#111;font-weight:900;width:36px;height:36px;border-radius:50%;border:3px solid white;${dashed}display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:11px;">S/${Math.round(offer.feeOffered)}</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const marker = L.marker([lat, lng], { icon, zIndexOffset: 500 }).addTo(
        mapRef.current,
      );
      const approxNote = hasRealCoords
        ? ""
        : `<br/><i style="color:#a3a3a3;font-size:11px;">Ubicación aproximada</i>`;
      marker.bindPopup(
        `<b>${escapeHtml(offer.order.customerName)}</b><br/>` +
          `${escapeHtml(offer.order.customerLocation ?? "—")}${approxNote}<br/>` +
          `<span style="color:#00A0A0;font-weight:bold">${Number(offer.distanceKm).toFixed(1)} km · S/ ${Number(offer.feeOffered).toFixed(0)}</span>`,
      );
      marker.on("click", () => marker.openPopup());
      marker.on("popupopen", () => {
        setTimeout(
          () => router.push(`/delivery-app/oferta/${offer.id}`),
          800,
        );
      });
      offerMarkersRef.current.push(marker);
    });
  }, [offers, router]);

  useEffect(() => {
    void renderOfferMarkers();
  }, [renderOfferMarkers]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] rounded-xl" />
  );
}

// Pequeño helper para evitar XSS en popups Leaflet (renderiza string HTML)
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
