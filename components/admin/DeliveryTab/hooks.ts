"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { DeliveryRouteView, DeliveryStopView, LiveTrackingEvent } from "./types";

/**
 * Hooks de polling para el dashboard de delivery en vivo.
 *
 * FIX 2026-05-06 (audit team — Bug Hunter #9):
 *   - Antes los hooks tenían un flag `cancelled` para el loop pero NO para
 *     los `setState` dentro de `load()`. Si la respuesta llegaba después de
 *     unmount, los setters disparaban → React warning + memory leak.
 *   - Ahora cada hook chequea `cancelled` después del await antes de cualquier
 *     setState. Además usamos AbortController para cortar fetches en vuelo.
 */

export function useDeliveryRoutes() {
  const [routes, setRoutes] = useState<DeliveryRouteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await tenantFetch("/api/admin/delivery/routes", { signal: controller.signal });
      if (cancelledRef.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: DeliveryRouteView[] };
      if (cancelledRef.current) return;
      setRoutes(json.data);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      // AbortError no es bug, es por unmount o nuevo fetch.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    const loop = async () => {
      if (cancelledRef.current) return;
      await load();
      if (cancelledRef.current) return;
      timerRef.current = setTimeout(loop, 20_000);
    };
    loop();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  return { routes, loading, error, reload: load };
}

export function useRouteStops(routeId: string | null) {
  const [stops, setStops] = useState<DeliveryStopView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!routeId) {
      if (!cancelledRef.current) setStops([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!cancelledRef.current) setLoading(true);
    try {
      const res = await tenantFetch(
        `/api/admin/delivery/routes/${encodeURIComponent(routeId)}/stops`,
        { signal: controller.signal },
      );
      if (cancelledRef.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: DeliveryStopView[] };
      if (cancelledRef.current) return;
      setStops(json.data);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    cancelledRef.current = false;
    // FIX: limpiar stops cuando se deselecciona la ruta (antes persistían).
    if (!routeId) {
      setStops([]);
      return;
    }
    const loop = async () => {
      if (cancelledRef.current) return;
      await load();
      if (cancelledRef.current) return;
      timerRef.current = setTimeout(loop, 15_000);
    };
    loop();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
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

export function useLiveTrackingFeed() {
  const [events, setEvents] = useState<LiveTrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await tenantFetch("/api/admin/delivery/tracking?limit=50", { signal: controller.signal });
      if (cancelledRef.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: LiveTrackingEvent[] };
      if (cancelledRef.current) return;
      setEvents(json.data);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    const loop = async () => {
      if (cancelledRef.current) return;
      await load();
      if (cancelledRef.current) return;
      timerRef.current = setTimeout(loop, 10_000);
    };
    loop();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  return { events, loading, error, reload: load };
}
