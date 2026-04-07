import { useRef, useCallback, useEffect } from "react";

type EventType = "view" | "click" | "add_to_cart" | "conversion";

interface TrackEvent {
  productId: number;
  eventType: EventType;
  timestamp: number;
}

// Debounce por producto: clave = "productId-eventType"
const DEBOUNCE_MS = 1000;
const FLUSH_INTERVAL_MS = 5000;

export function useProductAnalyticsTracking() {
  // Queue de eventos pendientes de envío
  const queueRef = useRef<Map<string, TrackEvent>>(new Map());
  // Último timestamp por clave (para debounce)
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushQueue = useCallback(() => {
    const queue = queueRef.current;
    if (queue.size === 0) return;

    const events = Array.from(queue.values());
    queue.clear();

    const payload = JSON.stringify({ events });

    // Usar sendBeacon si disponible (no bloquea la navegación)
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/marketplace/analytics/track-batch", new Blob([payload], { type: "application/json" }));
    } else {
      // Fallback: fetch con keepalive
      fetch("/api/marketplace/analytics/track-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  // Arrancar timer de flush cada 5 segundos
  useEffect(() => {
    timerRef.current = setInterval(flushQueue, FLUSH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Flush al desmontar
      flushQueue();
    };
  }, [flushQueue]);

  const enqueue = useCallback((productId: number, eventType: EventType) => {
    const key = `${productId}-${eventType}`;
    const now = Date.now();
    const last = lastSeenRef.current.get(key) ?? 0;

    // Debounce: ignorar si el mismo evento para el mismo producto llegó hace menos de DEBOUNCE_MS
    if (now - last < DEBOUNCE_MS) return;
    lastSeenRef.current.set(key, now);

    queueRef.current.set(key, { productId, eventType, timestamp: now });
  }, []);

  const trackView = useCallback((productId: number) => {
    enqueue(productId, "view");
  }, [enqueue]);

  const trackClick = useCallback((productId: number) => {
    enqueue(productId, "click");
  }, [enqueue]);

  const trackAddToCart = useCallback((productId: number) => {
    enqueue(productId, "add_to_cart");
  }, [enqueue]);

  const trackConversion = useCallback((productId: number) => {
    enqueue(productId, "conversion");
  }, [enqueue]);

  return { trackView, trackClick, trackAddToCart, trackConversion };
}

export default useProductAnalyticsTracking;
