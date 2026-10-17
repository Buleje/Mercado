"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import { descartarEsperado } from "@/lib/errores/sin-dato";

interface OrderNotification {
  id: string;
  customer: string;
  total: number;
  status: string;
}

interface NotificationState {
  connected: boolean;
  newOrders: OrderNotification[];
  lowStockCount: number;
  unseenCount: number;
}

/**
 * Espera antes de reconectar: 10 s, 20 s, 40 s… hasta 5 min; vuelve a 10 s
 * apenas la conexión abre. Con una espera fija de 10 s, una ruta caída (un 404
 * del dev server, un 503) dejaba un pedido fallido en la consola cada 10 s
 * mientras el panel estuviera abierto (medido 2026-09-14).
 */
const RECONEXION_BASE_MS = 10_000;
const RECONEXION_TOPE_MS = 5 * 60_000;

/**
 * Hook for real-time admin notifications via SSE.
 * Connects to /api/admin/notifications/stream SOLO si hay sesión admin.
 * Auto-reconnects on disconnect (pero no si nunca hubo auth).
 */
export function useAdminNotifications() {
  const [state, setState] = useState<NotificationState>({
    connected: false,
    newOrders: [],
    lowStockCount: 0,
    unseenCount: 0,
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let fallos = 0;

    function connect() {
      if (cancelled) return;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource("/api/admin/notifications/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
        fallos = 0;
        setState((prev) => ({ ...prev, connected: true }));
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "connected") return;

          if (data.type === "update" && data.newOrders?.length > 0) {
            setState((prev) => ({
              ...prev,
              newOrders: data.newOrders,
              lowStockCount: data.lowStockCount ?? prev.lowStockCount,
              unseenCount: prev.unseenCount + data.newOrders.length,
            }));
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        setState((prev) => ({ ...prev, connected: false }));
        programarReconexion();
      };
    }

    function programarReconexion() {
      const espera = Math.min(RECONEXION_BASE_MS * 2 ** fallos, RECONEXION_TOPE_MS);
      fallos += 1;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      // Re-verificar auth antes de reconectar (evita loop 401 infinito)
      reconnectTimerRef.current = setTimeout(() => {
        fetch("/api/auth/me")
          .then((r) => r.json())
          .then((d) => {
            if (!cancelled && d?.role === "admin") connect();
          })
          // Sin red o con el server reiniciando, la verificación falla igual que
          // el stream: antes se abandonaba y el panel quedaba sin avisos hasta
          // recargar. Ahora se reintenta con la espera siguiente.
          .catch(() => {
            if (!cancelled) programarReconexion();
          });
      }, espera);
    }

    // Gate inicial: solo conectar SSE si hay sesion admin confirmada.
    // cachedJson dedup: este hook lo usan varios componentes (bell, hub…) →
    // antes cada uno disparaba su /api/auth/me (4× por carga). Perf 2026-05-29.
    cachedJson<{ role?: string }>("/api/auth/me", 60_000)
      .then((d) => {
        if (!cancelled && d?.role === "admin") connect();
      })
      // Sin sesión admin confirmada no se abre el stream: no hay nada que avisar.
      .catch(descartarEsperado);

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const clearUnseen = useCallback(() => {
    setState((prev) => ({ ...prev, unseenCount: 0 }));
  }, []);

  return { ...state, clearUnseen };
}
