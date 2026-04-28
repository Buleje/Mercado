"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { MarketplaceFiltersState } from "@/components/marketplace/MarketplaceFilters";

/** Cache de coords del usuario en sessionStorage. Evita re-pedir GPS en cada
 *  navegación dentro de la misma sesión. TTL 1h. */
const GEO_CACHE_KEY = "buleje:geo:user-coords";
const GEO_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function readGeoCache(): { lat: number; lng: number } | null {
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

function writeGeoCache(coords: { lat: number; lng: number }) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ ...coords, ts: Date.now() }));
  } catch {}
}

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface MarketplaceStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  description: string | null;
  lat?: number | null;
  lng?: number | null;
  vacationMode?: boolean;
  vacationMessage?: string | null;
  // ── Backfill marketplace (TS-Sprint5) — opcionales para no romper consumers ──
  paymentMethods?: string[];
  minOrderAmount?: number;
  freeDelivery?: boolean;
  deliveryMinutes?: number;
  activePromos?: number;
  // ── TS-02 horarios derivados de Settings.autoCloseTime ──
  openHours?: Array<{ open: number; openMin: number; close: number; closeMin: number }> | null;
  isOpenNow?: boolean;
}

/* ── Zone approximate coords for Pucallpa (geo fallback) ───────────────────── */

export const ZONE_COORDS: Record<string, [number, number]> = {
  centro: [-8.3808, -74.5333],
  manantay: [-8.4031, -74.5156],
  calleria: [-8.37, -74.55],
  yarinacocha: [-8.2556, -74.5111],
  campo_verde: [-8.3833, -74.4667],
};

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

interface UseMarketplaceGeoReturn {
  geoLoading: boolean;
  geoActive: boolean;
  userCoords: { lat: number; lng: number } | null;
  filteredStores: MarketplaceStore[];
  handleGeoSort: () => void;
  setGeoActive: React.Dispatch<React.SetStateAction<boolean>>;
  setUserCoords: React.Dispatch<React.SetStateAction<{ lat: number; lng: number } | null>>;
}

export function useMarketplaceGeo(
  stores: MarketplaceStore[],
  setProductFilters: React.Dispatch<React.SetStateAction<MarketplaceFiltersState>>
): UseMarketplaceGeoReturn {
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoActive, setGeoActive] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ── Auto-detect silencioso al mount ──────────────────────────────────────
  // 1) Si tenemos coords cacheadas (TTL 1h), las usamos sin pedir permiso.
  // 2) Si no, consultamos Permissions API. Solo activamos auto-fetch si el
  //    usuario YA concedió permiso previamente (state="granted"). Nunca
  //    disparamos el prompt sin acción del user — eso lo hace handleGeoSort.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = readGeoCache();
    if (cached) {
      setUserCoords(cached);
      setGeoActive(true);
      setProductFilters((prev) => ({ ...prev, nearbyEnabled: true }));
      return;
    }
    if (!navigator.geolocation || !("permissions" in navigator)) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            writeGeoCache(coords);
            setUserCoords(coords);
            setGeoActive(true);
            setProductFilters((prev) => ({ ...prev, nearbyEnabled: true }));
          },
          () => { /* silent fail — el botón manual sigue disponible */ },
          { timeout: 5000, maximumAge: 60_000 },
        );
      })
      .catch(() => { /* navegadores viejos sin Permissions API → ignorar */ });
    return () => { cancelled = true; };
  }, [setProductFilters]);

  const filteredStores = useMemo(() => {
    if (!geoActive || !userCoords) return stores;

    return [...stores].sort((a, b) => {
      const coordsA = a.lat && a.lng
        ? [a.lat, a.lng]
        : ZONE_COORDS[a.zone?.toLowerCase().replace(/ /g, "_") ?? ""] ?? null;
      const coordsB = b.lat && b.lng
        ? [b.lat, b.lng]
        : ZONE_COORDS[b.zone?.toLowerCase().replace(/ /g, "_") ?? ""] ?? null;

      if (!coordsA && !coordsB) return 0;
      if (!coordsA) return 1;
      if (!coordsB) return -1;

      const distA = haversineKm(userCoords.lat, userCoords.lng, coordsA[0], coordsA[1]);
      const distB = haversineKm(userCoords.lat, userCoords.lng, coordsB[0], coordsB[1]);
      return distA - distB;
    });
  }, [stores, geoActive, userCoords]);

  const handleGeoSort = useCallback(() => {
    if (geoActive) {
      setGeoActive(false);
      setUserCoords(null);
      setProductFilters((prev) => ({ ...prev, nearbyEnabled: false }));
      return;
    }
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeGeoCache(coords);
        setUserCoords(coords);
        setGeoActive(true);
        setGeoLoading(false);
        setProductFilters((prev) => ({ ...prev, nearbyEnabled: true }));
      },
      () => {
        setGeoLoading(false);
        setProductFilters((prev) => ({ ...prev, nearbyEnabled: false }));
        alert(
          "No pudimos obtener tu ubicación. Para ver tiendas cerca, permití la ubicación en la configuración de tu navegador.",
        );
      },
      { timeout: 8000 },
    );
  }, [geoActive, setProductFilters]);

  return {
    geoLoading,
    geoActive,
    userCoords,
    filteredStores,
    handleGeoSort,
    setGeoActive,
    setUserCoords,
  };
}
