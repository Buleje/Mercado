"use client";

/**
 * app/admin/_hooks/useWebhookPendingCount.ts
 *
 * Hook que mantiene el contador de webhooks de billing pendientes para el
 * badge del sidebar. Sólo activo si el rol es "admin".
 *
 * Polling cada 60 segundos. Fail-soft: si el endpoint falla, mantiene el
 * último valor conocido.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect, useState } from "react";
import type { AdminRole } from "./useAdminAuth";

interface WebhookQueueItem {
  processedAt: string | null;
}

const POLL_INTERVAL_MS = 60_000;

export function useWebhookPendingCount(userRole: AdminRole): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (userRole !== "admin") return;

    const fetchCount = () =>
      fetch("/api/billing/webhook-queue")
        .then((r) => (r.ok ? r.json() : []))
        .then((items: WebhookQueueItem[]) =>
          setCount(items.filter((i) => !i.processedAt).length)
        )
        .catch(() => {});

    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userRole]);

  return count;
}
