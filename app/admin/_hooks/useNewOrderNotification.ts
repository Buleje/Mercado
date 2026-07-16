"use client";

/**
 * app/admin/_hooks/useNewOrderNotification.ts
 *
 * Hook que dispara una notificación push cuando aumenta el contador de
 * pedidos pendientes. Compara el valor actual con el anterior usando un ref.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect, useRef } from "react";
import type { QuickStats } from "./useAdminAlerts";

interface SendNotificationOptions {
  body?: string;
  tag?: string;
  requireInteraction?: boolean;
}

type SendNotification = (title: string, options?: SendNotificationOptions) => void;

export function useNewOrderNotification(
  quickStats: QuickStats | null,
  permission: NotificationPermission,
  sendNotification: SendNotification
): void {
  const prevPendingOrders = useRef<number | null>(null);

  useEffect(() => {
    if (!quickStats || prevPendingOrders.current === null) {
      prevPendingOrders.current = quickStats?.pendingOrders ?? 0;
      return;
    }

    const current = quickStats.pendingOrders;
    const previous = prevPendingOrders.current;

    if (current > previous && permission === "granted") {
      const newCount = current - previous;
      sendNotification(
        `${newCount} ${newCount === 1 ? "pedido nuevo" : "pedidos nuevos"}`,
        {
          body: "Haz clic para ver los detalles en el panel de administración",
          tag: "new-orders",
          requireInteraction: false,
        }
      );
    }

    prevPendingOrders.current = current;
  }, [quickStats, permission, sendNotification]);
}

/**
 * Notificación de navegador cuando SUBE el contador de mensajes WhatsApp sin
 * leer (mismo patrón prev-ref que los pedidos). El conteo llega por
 * /api/admin/stats (waUnread) y se refresca al instante vía SSE wa_message_new.
 */
export function useNewWaMessageNotification(
  quickStats: QuickStats | null,
  permission: NotificationPermission,
  sendNotification: SendNotification
): void {
  const prevUnread = useRef<number | null>(null);

  useEffect(() => {
    const current = quickStats?.waUnread ?? 0;
    if (!quickStats || prevUnread.current === null) {
      prevUnread.current = current;
      return;
    }

    const previous = prevUnread.current;
    if (current > previous && permission === "granted") {
      const newCount = current - previous;
      sendNotification(
        `${newCount} ${newCount === 1 ? "mensaje nuevo" : "mensajes nuevos"} de WhatsApp`,
        {
          body: "Un cliente te escribió — respondé desde Mensajes → WhatsApp",
          tag: "new-wa-messages",
          requireInteraction: false,
        }
      );
    }

    prevUnread.current = current;
  }, [quickStats, permission, sendNotification]);
}
