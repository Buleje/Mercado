"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

    function connect() {
      if (cancelled) return;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource("/api/admin/notifications/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
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
        // Re-verificar auth antes de reconectar (evita loop 401 infinito)
        reconnectTimerRef.current = setTimeout(() => {
          fetch("/api/auth/me")
            .then((r) => r.json())
            .then((d) => {
              if (!cancelled && d?.role === "admin") connect();
            })
            .catch(() => { /* auth check silent fail — reconexion deferida */ });
        }, 10_000);
      };
    }

    // Gate inicial: solo conectar SSE si hay sesion admin confirmada
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.role === "admin") connect();
      })
      .catch(() => { /* auth check silent fail — no SSE connect */ });

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
