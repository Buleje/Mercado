"use client";

import { useEffect } from "react";

/**
 * Escucha eventos SSE en tiempo real y lanza refetchers globales.
 * Montarlo en el administrador global o dashboard.
 */
export default function SSEListener() {
  useEffect(() => {
    // Evitamos montar múltiples en SSR
    if (typeof window === "undefined") return;

    let es: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      es = new EventSource("/api/admin/sse");

      es.onmessage = (e) => {
        try {
          if (e.data.startsWith(":")) return; // ping

          const ev = JSON.parse(e.data);
          if (ev.type === "new_order") {
            window.dispatchEvent(new CustomEvent("refresh-orders"));
            window.dispatchEvent(new CustomEvent("refresh-dashboard"));
          } else if (ev.type === "order_status_changed") {
            window.dispatchEvent(new CustomEvent("refresh-orders"));
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        // BUG-FIX (audit 2026-05-05): clearTimeout previo antes de asignar nuevo —
        // si onerror dispara 2 veces antes del reconnect, los timers anteriores
        // se acumulaban causando reconexiones duplicadas.
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (unmounted) return;
        fallbackTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (es) es.close();
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []);

  return null;
}
