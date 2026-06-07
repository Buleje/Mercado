"use client";

/**
 * StoreDistanceMapModal — mapa de una tienda + el cliente (2026-06-05).
 *
 * Se abre al tocar el ícono de ubicación en la card de /tiendas. Muestra:
 *   - Marcador de la tienda con su LOGO en su ubicación real.
 *   - Marcador del cliente (pin azul pulsante) en su ubicación GPS.
 *   - Una LÍNEA punteada uniendo ambos.
 *   - Panel con datos detallados: distancia (km, línea recta), zona, coords
 *     y botón "Cómo llegar" (Google Maps directions).
 *
 * Reusa el patrón Leaflet de TiendasMap (CARTO tiles, DivIcon, fitBounds).
 * Si la tienda no tiene lat/lng real cae al centroide de su zona (aprox).
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Navigation, MapPin } from "@buleje/design-system/icons";
import {
  ZONE_COORDS,
  haversineKm,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";

interface Props {
  open: boolean;
  onClose: () => void;
  store: MarketplaceStore;
  userCoords: { lat: number; lng: number };
}

/** Coords de la tienda: reales si existen, si no el centroide de su zona. */
function resolveStoreCoords(
  store: MarketplaceStore,
): { coords: [number, number]; approx: boolean } | null {
  if (typeof store.lat === "number" && typeof store.lng === "number") {
    return { coords: [store.lat, store.lng], approx: false };
  }
  const zoneKey = store.zone?.toLowerCase().replace(/ /g, "_") ?? "";
  const z = ZONE_COORDS[zoneKey];
  if (z) return { coords: z, approx: true };
  return null;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Pin con el LOGO de la tienda (circular, borde blanco + anillo accent). */
function storeLogoPinHtml(store: MarketplaceStore): string {
  const inner = store.logo
    ? `<img src="${escapeAttr(store.logo)}" alt="" class="buleje-logo-pin__img" />`
    : `<span class="buleje-logo-pin__fallback">${escapeAttr((store.name || "?").charAt(0).toUpperCase())}</span>`;
  return `
    <div class="buleje-logo-pin">
      <div class="buleje-logo-pin__ring">${inner}</div>
      <div class="buleje-logo-pin__tip"></div>
    </div>
  `;
}

function userPinHtml(): string {
  return `
    <div class="buleje-user-pin">
      <span class="buleje-user-pin__pulse"></span>
      <span class="buleje-user-pin__pulse buleje-user-pin__pulse--delay"></span>
      <span class="buleje-user-pin__dot"></span>
    </div>
  `;
}

let stylesInjected = false;
function ensureStyles(): void {
  if (typeof document === "undefined" || stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.dataset.buleje = "store-distance-map";
  style.textContent = `
    .buleje-logo-pin { position: relative; width: 52px; height: 60px; }
    .buleje-logo-pin__ring {
      position: absolute; top: 0; left: 0; width: 52px; height: 52px;
      border-radius: 50%; background: #fff; border: 3px solid var(--accent, #0d9488);
      box-shadow: 0 6px 16px rgba(0,0,0,0.3); overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      animation: buleje-logo-drop 480ms cubic-bezier(0.22, 1.2, 0.36, 1) backwards;
    }
    .buleje-logo-pin__img { width: 100%; height: 100%; object-fit: cover; }
    .buleje-logo-pin__fallback {
      font-size: 22px; font-weight: 900; color: var(--accent, #0d9488);
      font-family: system-ui, sans-serif;
    }
    .buleje-logo-pin__tip {
      position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);
      width: 0; height: 0; border-left: 7px solid transparent;
      border-right: 7px solid transparent; border-top: 10px solid var(--accent, #0d9488);
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.25));
    }
    @keyframes buleje-logo-drop {
      0% { transform: translateY(-24px) scale(0.6); opacity: 0; }
      70% { transform: translateY(3px) scale(1.05); opacity: 1; }
      100% { transform: translateY(0) scale(1); }
    }
    .buleje-user-pin { position: relative; width: 22px; height: 22px; }
    .buleje-user-pin__dot {
      position: absolute; inset: 0; margin: auto; width: 14px; height: 14px;
      border-radius: 50%; background: #2563eb; border: 3px solid #fff;
      box-shadow: 0 0 0 1px rgba(37,99,235,0.4), 0 4px 14px rgba(37,99,235,0.55); z-index: 2;
    }
    .buleje-user-pin__pulse {
      position: absolute; inset: 0; margin: auto; width: 14px; height: 14px;
      border-radius: 50%; background: rgba(37,99,235,0.45);
      animation: buleje-user-pulse 2.4s ease-out infinite; z-index: 1;
    }
    .buleje-user-pin__pulse--delay { animation-delay: 1.2s; }
    @keyframes buleje-user-pulse {
      0% { transform: scale(1); opacity: 0.55; }
      80% { transform: scale(3.2); opacity: 0; }
      100% { transform: scale(3.2); opacity: 0; }
    }
    .leaflet-tile-loaded { animation: buleje-tile-fade 380ms ease-out; }
    @keyframes buleje-tile-fade { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

/** Lee el color --accent resuelto (Leaflet/SVG no entiende var() en options). */
function resolveAccent(): string {
  if (typeof window === "undefined") return "#0d9488";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return v || "#0d9488";
}

export default function StoreDistanceMapModal({ open, onClose, store, userCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  const resolved = resolveStoreCoords(store);
  const distanceKm = resolved
    ? haversineKm(userCoords.lat, userCoords.lng, resolved.coords[0], resolved.coords[1])
    : null;

  // ESC + lock scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Init + render del mapa cuando abre
  useEffect(() => {
    if (!open || !resolved) return;
    let cancelled = false;
    (async () => {
      ensureStyles();
      await import("leaflet/dist/leaflet.css");
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const storePos: [number, number] = resolved.coords;
      const userPos: [number, number] = [userCoords.lat, userCoords.lng];
      const accent = resolveAccent();

      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true });
      mapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      // Línea punteada tienda <-> cliente
      L.polyline([userPos, storePos], {
        color: accent,
        weight: 3,
        opacity: 0.85,
        dashArray: "6 8",
      }).addTo(map);

      // Marcador tienda (logo)
      L.marker(storePos, {
        icon: L.divIcon({
          html: storeLogoPinHtml(store),
          className: "buleje-logo-pin-wrapper",
          iconSize: [52, 60],
          iconAnchor: [26, 60],
        }),
        zIndexOffset: 500,
      })
        .addTo(map)
        .bindTooltip(store.name, { direction: "top", offset: [0, -56] });

      // Marcador cliente
      L.marker(userPos, {
        icon: L.divIcon({
          html: userPinHtml(),
          className: "buleje-user-pin-wrapper",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        zIndexOffset: 1000,
      })
        .addTo(map)
        .bindTooltip("Tu ubicación", { direction: "top", offset: [0, -8] });

      try {
        map.fitBounds([userPos, storePos], { padding: [60, 60], maxZoom: 16 });
      } catch {
        map.setView(storePos, 14);
      }
      setTimeout(() => map.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, resolved, store, userCoords]);

  if (typeof document === "undefined" || !open) return null;

  const gmapsUrl = resolved
    ? `https://www.google.com/maps/dir/?api=1&origin=${userCoords.lat},${userCoords.lng}&destination=${resolved.coords[0]},${resolved.coords[1]}`
    : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ubicación de ${store.name}`}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--text-primary)]/55 backdrop-blur-sm"
      />

      <div className="relative z-10 flex w-full max-w-2xl max-h-[92vh] flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] px-4 py-3 sm:px-5">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            {store.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[var(--accent)]">
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Ubicación
            </p>
            <h2 className="truncate text-lg font-extrabold text-[var(--text-primary)]">{store.name}</h2>
          </div>
          {/* Cerrar — lateral derecho (consistente con los modales de pedido) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.75} aria-hidden />
          </button>
        </div>

        {/* Mapa */}
        {resolved ? (
          <div ref={containerRef} className="h-[44vh] min-h-[280px] w-full bg-[var(--surface-sunken)]" />
        ) : (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
            <MapPin className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
            <p className="text-sm font-bold text-[var(--text-primary)]">Sin ubicación registrada</p>
            <p className="text-xs text-[var(--text-tertiary)]">Esta tienda aún no configuró su dirección en el mapa.</p>
          </div>
        )}

        {/* Datos detallados */}
        <div className="shrink-0 space-y-3 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Distancia
              </p>
              <p className="mt-0.5 text-2xl font-black tabular-nums text-[var(--text-primary)]">
                {distanceKm != null ? `${distanceKm.toFixed(1)} km` : "—"}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                en línea recta{resolved?.approx ? " · aprox. por zona" : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Zona
              </p>
              <p className="mt-0.5 truncate text-base font-extrabold text-[var(--text-primary)]">
                {store.zone || "No especificada"}
              </p>
              {resolved && (
                <p className="text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
                  {resolved.coords[0].toFixed(4)}, {resolved.coords[1].toFixed(4)}
                </p>
              )}
            </div>
          </div>

          {gmapsUrl && (
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-lg transition-all hover:opacity-95 active:scale-[0.99]"
            >
              <Navigation className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              Cómo llegar
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
