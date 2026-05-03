"use client";

/**
 * NetworkErrorListener — escucha el evento global "buleje:network-error"
 * emitido por lib/client-fetch.ts y lo traduce en toasts.
 *
 * Mayo 2026 (designer audit P0): el sitio tenía 503 intermitentes en
 * /api/tenants/resolve, /api/promotions, etc. sin handling visible. El
 * usuario veía datos cacheados de respuestas anteriores sin saber que algo
 * falló. Este listener reporta el problema con un toast.
 *
 * Throttling: deduplicamos por url+status durante 8s para no spamear.
 */

import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

const recent = new Map<string, number>();
const DEDUP_WINDOW_MS = 8000;

export default function NetworkErrorListener() {
  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<{ url: string; status?: number; message: string }>;
      const { url, status, message } = ce.detail;
      const key = `${url}:${status ?? "net"}`;
      const last = recent.get(key) ?? 0;
      const now = Date.now();
      if (now - last < DEDUP_WINDOW_MS) return;
      recent.set(key, now);
      toast.error(message);
    }
    window.addEventListener("buleje:network-error", handler);
    return () => window.removeEventListener("buleje:network-error", handler);
  }, []);

  return null;
}
