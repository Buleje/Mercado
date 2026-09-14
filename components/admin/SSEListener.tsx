"use client";

import { useEffect } from "react";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import type { AdminRole } from "@/lib/session";

interface SSEListenerProps {
  /** Rol logueado — gatea /api/admin/sse (allowedRoles: admin, cajero). */
  userRole?: AdminRole | null;
  /** false mientras useAdminAuth resuelve el rol real. Default true = no
   *  rompe a los pocos callers que todavía no pasan estas props. */
  authReady?: boolean;
}

/**
 * Escucha eventos SSE en tiempo real y lanza refetchers globales.
 * Montarlo en el administrador global o dashboard.
 *
 * Gate de rol (2026-09-14): almacenero no puede pedir /api/admin/sse
 * (requireAdmin sólo deja admin/cajero) — antes se conectaba igual y el
 * navegador recibía un 403 en cada carga del panel.
 */
export default function SSEListener({ userRole = null, authReady = true }: SSEListenerProps) {
  const puede = authReady && puedePedir("/api/admin/sse", userRole);

  useEffect(() => {
    // Evitamos montar múltiples en SSR
    if (typeof window === "undefined") return;
    if (!puede) return;

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
  }, [puede]);

  return null;
}
