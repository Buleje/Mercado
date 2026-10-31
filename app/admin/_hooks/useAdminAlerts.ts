"use client";

/**
 * app/admin/_hooks/useAdminAlerts.ts
 *
 * Hook que mantiene los alerts (badges) y quickStats del panel admin.
 * Consume `/api/admin/stats` con dos estrategias:
 *  - Sondeo compartido cada 60 s (`suscribirSondeo`, 16-10): la campana y el
 *    Inicio leen la misma URL por `cachedJson`, así que al abrir el panel sale
 *    UN pedido de stats en vez de tres; con la pestaña oculta no se pide.
 *  - SSE en `/api/admin/sse` para updates instantáneos cuando entra un pedido nuevo
 *
 * SSE auto-disable: si falla 3 veces seguidas se rinde y queda solo el polling
 * (Cloudflare tunnels y algunos proxies matan conexiones SSE largas).
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 *
 * Gate de rol (2026-09-14): almacenero no puede pedir ni /api/admin/stats ni
 * /api/admin/sse (requireAdmin los rechaza con 403) — antes este hook los
 * pedía igual en cada carga del panel. `puedePedir` espeja el allowedRoles
 * real de cada ruta (lib/auth/roles-rutas-panel.ts), así que si el backend
 * cambia a quién deja pasar, este hook lo sigue sin tocar código acá.
 */

import { useCallback, useEffect, useState } from "react";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { refrescarSondeo, suscribirSondeo } from "@/lib/client-cache-fetch";
import type { AdminRole } from "./useAdminAuth";

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

const STATS_URL = "/api/admin/stats";
const POLL_INTERVAL_MS = 60_000;
const SSE_MAX_FAILURES = 3;
const SSE_BACKOFF_BASE_MS = 5000;

export function useAdminAlerts(authReady: boolean, userRole: AdminRole | null): UseAdminAlertsResult {
  const [alerts, setAlerts] = useState<Record<string, number>>({});
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const puedeStats = authReady && puedePedir("/api/admin/stats", userRole);
  const puedeSSE = authReady && puedePedir("/api/admin/sse", userRole);

  const aplicar = useCallback((d: StatsResponse | null) => {
    if (!d) return;
    const a: Record<string, number> = {};
    if (d.lowStockProducts > 0) a["inventario"] = d.lowStockProducts;
    if (d.pendingOrders > 0) a.pedidos = d.pendingOrders;
    // Mensajes WhatsApp sin leer → badge en el tab WhatsApp del sidebar
    // (y en Mensajes/marketplace-chat, que también contiene el inbox)
    const wa = d.waUnread ?? 0;
    if (wa > 0) {
      a["whatsapp-inbox"] = wa;
      a["marketplace-chat"] = wa;
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
  }, []);

  // Sondeo compartido: pausa con la pestaña oculta y pide al volver si venció.
  // Rol sin permiso (p.ej. almacenero) → ni intentarlo, requireAdmin lo
  // rechaza siempre con 403.
  useEffect(() => {
    if (!puedeStats) return;
    return suscribirSondeo<StatsResponse>(STATS_URL, POLL_INTERVAL_MS, aplicar);
  }, [puedeStats, aplicar]);

  /** Pide ya (pedido nuevo, mensaje entrante): avisa a todos los que leen stats. */
  const fetchAlerts = useCallback(() => {
    if (puedeStats) refrescarSondeo(STATS_URL);
  }, [puedeStats]);

  // SSE: update instantáneo al recibir un pedido nuevo
  useEffect(() => {
    if (!puedeSSE) return;
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
  }, [puedeSSE, fetchAlerts]);

  return { alerts, quickStats, fetchAlerts };
}
