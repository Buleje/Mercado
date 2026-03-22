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
    let fallbackTimer: NodeJS.Timeout;

    const connect = () => {
      es = new EventSource("/api/admin/sse");

      es.onmessage = (e) => {
        try {
          if (e.data.startsWith(":")) return; // ping
          
          const ev = JSON.parse(e.data);
          if (ev.type === "new_order") {
            // Fuerza un refetch si se están usando store globales / o un mutate local
            window.dispatchEvent(new CustomEvent("refresh-orders"));
            window.dispatchEvent(new CustomEvent("refresh-dashboard"));
          } else if (ev.type === "order_status_changed") {
            window.dispatchEvent(new CustomEvent("refresh-orders"));
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es?.close();
        // Reconnect after 5s
        fallbackTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (es) es.close();
      clearTimeout(fallbackTimer);
    };
  }, []);

  return null;
}
