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
