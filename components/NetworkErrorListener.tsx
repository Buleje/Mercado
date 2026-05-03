"use client";

/**
 * NetworkErrorListener — escucha eventos del NetworkErrorBus interno
 * (lib/client-fetch.ts) y los traduce en toasts.
 *
 * Mayo 2026 (designer audit P9):
 *   - Antes escuchaba `window.addEventListener("buleje:network-error")`,
 *     lo cual permitía que cualquier script de terceros (analytics, tag
 *     manager, XSS reflejado) disparara toasts con mensajes phishing.
 *   - Ahora suscribe a `NetworkErrorBus` (EventTarget privado del módulo),
 *     que solo emite desde clientFetch interno. Imposible de inyectar
 *     desde terceros.
 *
 * Throttling: dedup por url+status durante 8s para no spamear.
 * Cleanup: el Map `recent` se limpia cada 60s para evitar memory leak
 * en sesiones largas.
 */

import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { NetworkErrorBus } from "@/lib/client-fetch";

const recent = new Map<string, number>();
const DEDUP_WINDOW_MS = 8000;
const CLEANUP_INTERVAL_MS = 60_000;

export default function NetworkErrorListener() {
  useEffect(() => {
    if (!NetworkErrorBus) return;

    function handler(e: Event) {
      const ce = e as CustomEvent<{ url: string; status?: number; message: string }>;
      const { url, status, message } = ce.detail;
      const key = `${url}:${status ?? "net"}`;
      const now = Date.now();
      const last = recent.get(key) ?? 0;
      if (now - last < DEDUP_WINDOW_MS) return;
      recent.set(key, now);
      toast.error(message);
    }

    NetworkErrorBus.addEventListener("network-error", handler);

    // Cleanup periódico del Map (memory leak en sesiones largas)
    const cleanupId = setInterval(() => {
      const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
      for (const [k, ts] of recent) {
        if (ts < cutoff) recent.delete(k);
      }
    }, CLEANUP_INTERVAL_MS);

    return () => {
      NetworkErrorBus?.removeEventListener("network-error", handler);
      clearInterval(cleanupId);
    };
  }, []);

  return null;
}
