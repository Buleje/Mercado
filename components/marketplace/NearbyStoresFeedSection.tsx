"use client";

/**
 * NearbyStoresFeedSection — wrapper de descubrimiento "Cerca de ti" para el
 * feed del marketplace. Envuelve FeaturedStoresNearby (que necesita coords)
 * SIN forzar un prompt de GPS al cargar:
 *
 *   1. Lee coords cacheadas en sessionStorage (las escribe useMarketplaceGeo /
 *      el location bar tras un permiso previo) → renderiza directo.
 *   2. Sin coords → muestra una tarjeta slim con CTA "Activar ubicación" que
 *      pide geolocation UNA vez al click (opt-in), cachea y re-renderiza.
 *   3. Permiso denegado → la tarjeta desaparece (degradación silenciosa).
 *
 * Así "Cerca de ti" aparece para quien ya compartió ubicación, y ofrece un
 * camino de un toque para el resto, sin molestar con prompts automáticos.
 */
import { useEffect, useState, useCallback } from "react";
import { MapPin, Loader2 } from "@buleje/design-system/icons";
import FeaturedStoresNearby from "@/components/marketplace/FeaturedStoresNearby";

const GEO_CACHE_KEY = "buleje:geo:user-coords";
const GEO_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — mismo contrato que useMarketplaceGeo

type Coords = { lat: number; lng: number };

function readGeoCache(): Coords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number; ts: number };
    if (Date.now() - parsed.ts > GEO_CACHE_TTL_MS) return null;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function writeGeoCache(coords: Coords) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ ...coords, ts: Date.now() }));
  } catch {}
}

export default function NearbyStoresFeedSection() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [denied, setDenied] = useState(false);

  // Hidratación: leer cache sin prompt.
  useEffect(() => {
    const cached = readGeoCache();
    if (cached) setCoords(cached);
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDenied(true);
      return;
    }
    setRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeGeoCache(next);
        setCoords(next);
        setRequesting(false);
      },
      () => {
        setDenied(true);
        setRequesting(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: GEO_CACHE_TTL_MS },
    );
  }, []);

  // Con coords → la sección real (que ya trae su propio header + grid + drawer).
  if (coords) return <FeaturedStoresNearby userCoords={coords} />;

  // Permiso denegado / sin soporte → no ocupar espacio.
  if (denied) return null;

  // CTA opt-in de un toque (no prompt automático).
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-6 text-center sm:flex-row sm:text-left">
      <span
        aria-hidden
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      >
        <MapPin className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-extrabold text-[var(--text-primary)]">
          Tiendas cerca de ti
        </h3>
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Activá tu ubicación y te mostramos las bodegas más cercanas con delivery rápido.
        </p>
      </div>
      <button
        type="button"
        onClick={requestLocation}
        disabled={requesting}
        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent)]/90 disabled:opacity-60"
      >
        {requesting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Ubicando…
          </>
        ) : (
          <>
            <MapPin className="h-4 w-4" aria-hidden />
            Activar ubicación
          </>
        )}
      </button>
    </div>
  );
}
