"use client";

/**
 * PartnerMap — mapa Leaflet con la posición del partner + offers pending.
 * Auto-refresh cada 15s. Click en oferta → /delivery-app/oferta/[id].
 *
 * Usa CDN icons de Leaflet para evitar issues de bundler con _getIconUrl.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Offer {
  id: string;
  distanceKm: number;
  feeOffered: number;
  expiresAt: string;
  order: {
    customerName: string;
    customerLocation: string | null;
  };
}

interface Props {
  partnerLat: number;
  partnerLng: number;
}

const REFRESH_MS = 15_000;

// Coords default Pucallpa centro — para offers que no tienen lat/lng exact
// (mientras no implementemos geocoding del customerLocation, mostramos el
// marker del cliente al rededor del centro con leve offset por id).
function offsetForOffer(offerId: string): { dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < offerId.length; i++) h = (h * 31 + offerId.charCodeAt(i)) | 0;
  const dx = ((h & 0xff) / 255 - 0.5) * 0.02; // ±~1km
  const dy = (((h >> 8) & 0xff) / 255 - 0.5) * 0.02;
  return { dx, dy };
}

export default function PartnerMap({ partnerLat, partnerLng }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerMarkerRef = useRef<any>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const prevMapOffersHashRef = useRef<string>("");

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

      const map = L.map(containerRef.current).setView([partnerLat, partnerLng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      // Marker partner — icono custom (color verde Buleje)
      const partnerIcon = L.divIcon({
        html: `<div style="background:var(--accent);width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      partnerMarkerRef.current = L.marker([partnerLat, partnerLng], { icon: partnerIcon })
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

  // Actualizar marker partner cuando cambia coords.
  useEffect(() => {
    if (partnerMarkerRef.current) {
      partnerMarkerRef.current.setLatLng([partnerLat, partnerLng]);
    }
  }, [partnerLat, partnerLng]);

  // Polling de offers.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/delivery/me/offers", { credentials: "include" });
        if (!res.ok) return;
        const data: { offers: Offer[] } = await res.json();
        if (!cancelled) {
          const newHash = JSON.stringify(data.offers);
          if (newHash !== prevMapOffersHashRef.current) {
            prevMapOffersHashRef.current = newHash;
            setOffers(data.offers);
          }
        }
      } catch {
        // noop
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Render markers de offers cuando cambian.
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      // Limpiar markers anteriores.
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      offers.forEach((offer) => {
        const { dx, dy } = offsetForOffer(offer.id);
        const lat = partnerLat + dx;
        const lng = partnerLng + dy;
        const offerIcon = L.divIcon({
          html: `<div style="background:#fbbf24;color:#111;font-weight:900;width:34px;height:34px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:11px;">S/${Math.round(offer.feeOffered)}</div>`,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const marker = L.marker([lat, lng], { icon: offerIcon }).addTo(mapRef.current);
        marker.bindPopup(`
          <b>${offer.order.customerName}</b><br/>
          ${offer.order.customerLocation ?? "—"}<br/>
          <span style="color:var(--accent);font-weight:bold">${Number(offer.distanceKm).toFixed(1)} km · S/ ${Number(offer.feeOffered).toFixed(0)}</span>
        `);
        marker.on("click", () => {
          marker.openPopup();
        });
        marker.on("popupopen", () => {
          setTimeout(() => router.push(`/delivery-app/oferta/${offer.id}`), 800);
        });
        markersRef.current.push(marker);
      });
    });
  }, [offers, partnerLat, partnerLng, router]);

  return <div ref={containerRef} className="w-full h-full min-h-[400px] rounded-xl" />;
}
