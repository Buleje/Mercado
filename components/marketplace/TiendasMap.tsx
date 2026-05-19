"use client";

/**
 * TiendasMap — vista mapa Leaflet del directorio /tiendas (rediseño 2026-05).
 *
 * Mejoras vs versión anterior:
 *   - Markers custom (DivIcon) con color brand y emoji por categoría.
 *   - Ubicación del cliente: pin azul pulsante (CSS animation).
 *   - Popup con diseño que respeta el design system del proyecto.
 *   - Auto-fit bounds incluye al user.
 *   - Animación al montar: zoom desde fuera hacia el bounding box.
 *
 * Brandon mayo 2026: "ahí aparezca mi dirección y las tiendas alrededores
 * tipo animado".
 */

import { useEffect, useRef } from "react";
import {
  ZONE_COORDS,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];
const DEFAULT_ZOOM = 12;

/** Emoji por categoría — fallback al pin genérico si no matchea. */
const CATEGORY_EMOJI: Record<string, string> = {
  bodega: "🏪",
  abarrotes: "🛒",
  polleria: "🍗",
  panaderia: "🥖",
  restaurante: "🍽️",
  pizzeria: "🍕",
  pizza: "🍕",
  farmacia: "💊",
  juguería: "🥤",
  jugueria: "🥤",
  cafeteria: "☕",
  cafetería: "☕",
  ferreteria: "🔧",
  ferretería: "🔧",
  papeleria: "📚",
  papelería: "📚",
  moda: "👗",
  belleza: "💄",
  pollos: "🍗",
  helados: "🍦",
  pastelería: "🎂",
  pasteleria: "🎂",
  bebidas: "🧃",
};

interface Props {
  stores: MarketplaceStore[];
  userCoords?: { lat: number; lng: number } | null;
  className?: string;
}

interface LeafletInstances {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storeLayer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userLayer: any;
}

function getCoords(store: MarketplaceStore): [number, number] | null {
  // Brandon mayo 2026: solo pintamos pins en el mapa cuando la tienda
  // tiene coordenadas reales (lat/lng). Antes habia fallback a las
  // coords del centroide de la zona — eso ponia pins falsos para
  // tiendas sin direccion registrada. Si no hay dato real, no se pinta.
  if (typeof store.lat === "number" && typeof store.lng === "number") {
    return [store.lat, store.lng];
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

// Brandon mayo 2026: pin con icono de tienda (SVG estilo Lucide) en
// lugar de emojis decorativos (regla del proyecto: solo iconos del DS).
// Mantenemos CATEGORY_EMOJI para compat en otros consumers, pero el pin
// del mapa siempre usa el mismo icono "negocio" — limpio y consistente.
const STORE_PIN_SVG = `
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true">
    <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
    <path d="M2 7h20"/>
    <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>
  </svg>
`;

/**
 * Devuelve el HTML del pin custom de tienda. Pin tipo "drop" con icono
 * Store (SVG Lucide) centrado, sombra debajo, glow al hover (CSS
 * injectado una sola vez via .buleje-store-pin).
 */
function storePinHtml(_store: MarketplaceStore): string {
  return `
    <div class="buleje-store-pin">
      <div class="buleje-store-pin__shadow"></div>
      <div class="buleje-store-pin__body">
        <span class="buleje-store-pin__icon">${STORE_PIN_SVG}</span>
      </div>
    </div>
  `;
}

/** Pin del usuario: punto azul con anillo pulsante. */
function userPinHtml(): string {
  return `
    <div class="buleje-user-pin">
      <span class="buleje-user-pin__pulse"></span>
      <span class="buleje-user-pin__pulse buleje-user-pin__pulse--delay"></span>
      <span class="buleje-user-pin__dot"></span>
    </div>
  `;
}

function buildPopup(store: MarketplaceStore): string {
  const name = escapeHtml(store.name);
  const slug = encodeURIComponent(store.slug);
  const category = escapeHtml(store.category ?? "");
  const rating =
    store.rating > 0
      ? `<span class="buleje-popup__chip buleje-popup__chip--rating">★ ${Number(store.rating).toFixed(1)}</span>`
      : "";
  const reviews =
    store.reviewCount > 0
      ? `<span class="buleje-popup__muted">${store.reviewCount} reseñas</span>`
      : "";
  const delivery = store.deliveryMinutes
    ? `<span class="buleje-popup__muted">~${store.deliveryMinutes} min</span>`
    : "";
  const promos =
    store.activePromos && store.activePromos > 0
      ? `<span class="buleje-popup__chip buleje-popup__chip--promo">${store.activePromos} ofertas</span>`
      : "";
  return `
    <div class="buleje-popup">
      <div class="buleje-popup__category">${category}</div>
      <div class="buleje-popup__name">${name}</div>
      <div class="buleje-popup__row">${rating}${reviews}${delivery}</div>
      ${promos ? `<div class="buleje-popup__row">${promos}</div>` : ""}
      <a href="/marketplace/${slug}" class="buleje-popup__cta">Ver tienda →</a>
    </div>
  `;
}

/**
 * Inyecta el CSS del pin custom una sola vez (idempotente). Vive a nivel
 * de document para que Leaflet lo agarre dentro de los DivIcons.
 */
let pinStylesInjected = false;
function ensurePinStyles(): void {
  if (typeof document === "undefined" || pinStylesInjected) return;
  pinStylesInjected = true;
  const style = document.createElement("style");
  style.dataset.buleje = "tiendas-map";
  style.textContent = `
    .buleje-store-pin {
      position: relative;
      width: 38px;
      height: 46px;
      pointer-events: auto;
      cursor: pointer;
    }
    .buleje-store-pin__shadow {
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 18px;
      height: 6px;
      background: rgba(0,0,0,0.28);
      border-radius: 999px;
      filter: blur(3px);
    }
    .buleje-store-pin__body {
      position: absolute;
      top: 0;
      left: 0;
      width: 38px;
      height: 38px;
      background: var(--brand-primary, var(--accent));
      border: 2.5px solid #fff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px color-mix(in oklab, var(--accent) 45%, transparent);
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease;
    }
    .buleje-store-pin:hover .buleje-store-pin__body {
      transform: rotate(-45deg) scale(1.18) translate(2px, -2px);
      box-shadow: 0 8px 22px color-mix(in oklab, var(--accent) 70%, transparent);
    }
    .buleje-store-pin__icon {
      transform: rotate(45deg);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25));
    }
    .buleje-store-pin__icon svg {
      width: 20px;
      height: 20px;
    }
    /* Compat antiguo selector __emoji (queda como fallback si el HTML
       todavia tiene el span legacy mientras se mergea el deploy) */
    .buleje-store-pin__emoji {
      transform: rotate(45deg);
      font-size: 18px;
      line-height: 1;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25));
    }

    /* Animación de entrada — los pins caen desde arriba con bounce */
    @keyframes buleje-pin-drop {
      0%   { transform: translateY(-30px); opacity: 0; }
      60%  { transform: translateY(4px); opacity: 1; }
      80%  { transform: translateY(-2px); }
      100% { transform: translateY(0); }
    }
    .leaflet-marker-icon .buleje-store-pin {
      animation: buleje-pin-drop 480ms cubic-bezier(0.22, 1.2, 0.36, 1) backwards;
    }

    /* User pin — punto azul con doble pulse */
    .buleje-user-pin {
      position: relative;
      width: 22px;
      height: 22px;
    }
    .buleje-user-pin__dot {
      position: absolute;
      inset: 0;
      margin: auto;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #2563eb;
      border: 3px solid #fff;
      box-shadow: 0 0 0 1px rgba(37,99,235,0.4), 0 4px 14px rgba(37,99,235,0.55);
      z-index: 2;
    }
    .buleje-user-pin__pulse {
      position: absolute;
      inset: 0;
      margin: auto;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: rgba(37,99,235,0.45);
      animation: buleje-user-pulse 2.4s ease-out infinite;
      z-index: 1;
    }
    .buleje-user-pin__pulse--delay {
      animation-delay: 1.2s;
    }
    @keyframes buleje-user-pulse {
      0%   { transform: scale(1);   opacity: 0.55; }
      80%  { transform: scale(3.2); opacity: 0;    }
      100% { transform: scale(3.2); opacity: 0;    }
    }

    /* Popup styling — design system tokens */
    .leaflet-popup-content-wrapper {
      border-radius: 14px !important;
      box-shadow: 0 12px 32px rgba(0,0,0,0.18) !important;
      padding: 0 !important;
    }
    .leaflet-popup-content {
      margin: 0 !important;
      width: auto !important;
    }
    .buleje-popup {
      min-width: 220px;
      padding: 14px 16px 12px;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .buleje-popup__category {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--brand-primary, var(--accent));
      margin-bottom: 2px;
    }
    .buleje-popup__name {
      font-size: 15px;
      font-weight: 800;
      color: #111;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .buleje-popup__row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .buleje-popup__chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
    }
    .buleje-popup__chip--rating {
      background: #fef3c7;
      color: #92400e;
    }
    .buleje-popup__chip--promo {
      background: #fee2e2;
      color: #b91c1c;
    }
    .buleje-popup__muted {
      color: #6b7280;
      font-size: 12px;
      font-weight: 600;
    }
    .buleje-popup__cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--brand-primary, var(--accent));
      color: #fff;
      border-radius: 10px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.03em;
      transition: transform 180ms ease, box-shadow 180ms ease;
    }
    .buleje-popup__cta:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px color-mix(in oklab, var(--accent) 45%, transparent);
    }

    /* Tile fade-in suave al montar el mapa */
    @keyframes buleje-tile-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .leaflet-tile-loaded {
      animation: buleje-tile-fade 380ms ease-out;
    }
  `;
  document.head.appendChild(style);
}

export default function TiendasMap({ stores, userCoords, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<LeafletInstances | null>(null);
  const initRef = useRef(false);

  // Init map una sola vez
  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;
    let cancelled = false;

    (async () => {
      ensurePinStyles();
      await import("leaflet/dist/leaflet.css");
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView(PUCALLPA_CENTER, DEFAULT_ZOOM);

      // CARTO Voyager: tiles más limpios y con mejor tipografía que OSM default
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      const storeLayer = L.layerGroup().addTo(map);
      const userLayer = L.layerGroup().addTo(map);
      instancesRef.current = { map, storeLayer, userLayer };

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

  // Repintar markers de tiendas + user cuando cambia la lista o coords
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const inst = instancesRef.current;
      if (!inst) return;
      const L = await import("leaflet");
      if (cancelled) return;

      // Limpiar capas
      inst.storeLayer.clearLayers();
      inst.userLayer.clearLayers();

      const bounds: Array<[number, number]> = [];

      // Stores
      for (const s of stores) {
        const coords = getCoords(s);
        if (!coords) continue;
        bounds.push(coords);
        const icon = L.divIcon({
          html: storePinHtml(s),
          className: "buleje-store-pin-wrapper",
          iconSize: [38, 46],
          iconAnchor: [19, 46],
          popupAnchor: [0, -42],
        });
        const marker = L.marker(coords, { icon }).bindPopup(buildPopup(s), {
          closeButton: true,
          autoPan: true,
          maxWidth: 260,
        });
        marker.addTo(inst.storeLayer);
      }

      // Usuario — solo si tenemos coords
      if (userCoords) {
        const userPos: [number, number] = [userCoords.lat, userCoords.lng];
        bounds.push(userPos);
        const userIcon = L.divIcon({
          html: userPinHtml(),
          className: "buleje-user-pin-wrapper",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker(userPos, { icon: userIcon, zIndexOffset: 1000 })
          .bindTooltip("Tu ubicación", { direction: "top", offset: [0, -8], className: "buleje-user-tooltip" })
          .addTo(inst.userLayer);
      }

      // Animación de entrada: fitBounds con padding generoso
      if (bounds.length > 0) {
        try {
          inst.map.flyToBounds(bounds, {
            padding: [50, 50],
            maxZoom: 14,
            duration: 0.9,
            easeLinearity: 0.25,
          });
        } catch {
          /* ignorar — fitBounds puede fallar si bounds está malformado */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stores, userCoords]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Mapa interactivo de tiendas"
      className={className ?? "w-full h-[60vh] min-h-[400px] rounded-2xl overflow-hidden border-2 border-[var(--rule-base)] shadow-lg"}
    />
  );
}
