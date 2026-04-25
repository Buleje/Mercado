"use client";

import { useState, useMemo, useCallback } from "react";
import type { MarketplaceFiltersState } from "@/components/marketplace/MarketplaceFilters";

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
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
