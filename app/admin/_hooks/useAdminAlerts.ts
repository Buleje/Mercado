"use client";

/**
 * app/admin/_hooks/useAdminAlerts.ts
 *
 * Hook que mantiene los alerts (badges) y quickStats del panel admin.
 * Consume `/api/admin/stats` con dos estrategias:
 *  - Polling cada 60 s (con retraso inicial de 3 s para no competir con DashboardTab)
 *  - SSE en `/api/admin/sse` para updates instantáneos cuando entra un pedido nuevo
 *
 * SSE auto-disable: si falla 3 veces seguidas se rinde y queda solo el polling
 * (Cloudflare tunnels y algunos proxies matan conexiones SSE largas).
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useCallback, useEffect, useState } from "react";

export interface QuickStats {
  pendingOrders: number;
  todayRevenue: number;
  lowStockProducts: number;
  overduePayables?: number;
  oldPendingOrders?: number;
  /** Mensajes WhatsApp entrantes sin leer (badge de Mensajes). */
  waUnread?: number;
}

interface StatsResponse {
  pendingOrders: number;
  todayRevenue: number;
  lowStockProducts: number;
  overduePayables?: number;
  oldPendingOrders?: number;
  waUnread?: number;
}

export interface UseAdminAlertsResult {
  alerts: Record<string, number>;
  quickStats: QuickStats | null;
  fetchAlerts: () => void;
}

const POLL_INTERVAL_MS = 60_000;
const POLL_INITIAL_DELAY_MS = 3000;
const SSE_MAX_FAILURES = 3;
const SSE_BACKOFF_BASE_MS = 5000;

export function useAdminAlerts(authReady: boolean): UseAdminAlertsResult {
  const [alerts, setAlerts] = useState<Record<string, number>>({});
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);

  const fetchAlerts = useCallback(() => {
    // Skip si la pestaña está oculta — evita invocar /api/admin/stats mientras
    // el usuario trabaja en otra tab (p.ej. cajera con el admin abierto pero
    // atendiendo el mostrador). Ahorra hasta 80% de invocaciones ociosas.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: StatsResponse | null) => {
        if (!d) return;
        const a: Record<string, number> = {};
        if (d.lowStockProducts > 0) a["inventario"] = d.lowStockProducts;
        if (d.pendingOrders > 0) a.pedidos = d.pendingOrders;
        // Mensajes WhatsApp sin leer → badge en el tab WhatsApp del sidebar
        // (y en Mensajes/marketplace-chat, que también contiene el inbox)
        if ((d.waUnread ?? 0) > 0) {
          a["whatsapp-inbox"] = d.waUnread!;
          a["marketplace-chat"] = d.waUnread!;
        }
        setAlerts(a);
        setQuickStats({
          pendingOrders: d.pendingOrders,
          todayRevenue: d.todayRevenue,
          lowStockProducts: d.lowStockProducts,
          overduePayables: d.overduePayables,
          oldPendingOrders: d.oldPendingOrders,
          waUnread: d.waUnread,
        });
      })
      .catch(() => {});
  }, []);

  // Polling: 3 s delay inicial + cada 60 s + reactivación al volver a la pestaña
  useEffect(() => {
    const t = setTimeout(fetchAlerts, POLL_INITIAL_DELAY_MS);
    const interval = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    // Al volver el foco, refrescar inmediatamente (sin esperar 60s más).
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchAlerts();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchAlerts]);

  // SSE: update instantáneo al recibir un pedido nuevo
  useEffect(() => {
    if (!authReady) return;
    let failCount = 0;
    let es: EventSource | null = null;
    let stopped = false;

    function connect() {
      if (stopped || failCount >= SSE_MAX_FAILURES) return;
      es = new EventSource("/api/admin/sse");
      es.addEventListener("new_order", () => {
        failCount = 0;
        fetchAlerts();
      });
      // Mensaje WhatsApp entrante → refrescar el badge de Mensajes al instante
      es.addEventListener("wa_message_new", () => {
        failCount = 0;
        fetchAlerts();
      });
      es.addEventListener("open", () => {
        failCount = 0;
      });
      es.onerror = () => {
        failCount++;
        es?.close();
        if (!stopped && failCount < SSE_MAX_FAILURES) {
          setTimeout(connect, SSE_BACKOFF_BASE_MS * failCount);
        }
      };
    }

    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, [authReady, fetchAlerts]);

  return { alerts, quickStats, fetchAlerts };
}
