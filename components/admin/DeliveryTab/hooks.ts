"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { DeliveryRouteView, DeliveryStopView, LiveTrackingEvent } from "./types";

/**
 * Hook: lista de rutas del día con polling automático (20 s).
 * Usa tenantFetch para que el header x-tenant-id esté presente.
 */
export function useDeliveryRoutes() {
  const [routes, setRoutes] = useState<DeliveryRouteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await tenantFetch("/api/admin/delivery/routes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: DeliveryRouteView[] };
      setRoutes(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      await load();
      timerRef.current = setTimeout(loop, 20_000);
    };
    loop();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  return { routes, loading, error, reload: load };
}

/**
 * Hook: paradas de una ruta específica, con polling 15 s.
 */
export function useRouteStops(routeId: string | null) {
  const [stops, setStops] = useState<DeliveryStopView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!routeId) {
      setStops([]);
      return;
    }
    setLoading(true);
    try {
      const res = await tenantFetch(
        `/api/admin/delivery/routes/${encodeURIComponent(routeId)}/stops`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: DeliveryStopView[] };
      setStops(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      await load();
      timerRef.current = setTimeout(loop, 15_000);
    };
    loop();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [routeId, load]);

  const markStop = useCallback(
    async (
      stopId: string,
      status: "arrived" | "delivered" | "failed" | "skipped",
      opts: { failureReason?: string; proofPhotoUrl?: string } = {},
    ) => {
      if (!routeId) return;
      const res = await tenantFetch(
        `/api/admin/delivery/routes/${encodeURIComponent(routeId)}/stops`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stopId, status, ...opts }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [routeId, load],
  );

  return { stops, loading, error, reload: load, markStop };
}

/**
 * Hook: feed en vivo de los últimos eventos de tracking del tenant.
 * Polling agresivo (10 s) porque es la señal en vivo del dashboard.
 */
export function useLiveTrackingFeed() {
  const [events, setEvents] = useState<LiveTrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await tenantFetch("/api/admin/delivery/tracking?limit=50");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: LiveTrackingEvent[] };
      setEvents(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      await load();
      timerRef.current = setTimeout(loop, 10_000);
    };
    loop();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  return { events, loading, error, reload: load };
}
