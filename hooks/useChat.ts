"use client";

/**
 * useChat — fetcher deduplicado para `/api/chat`.
 *
 * Background:
 *   Audit 2026-05-20 reportó que `/api/chat?phone=...` se llamaba 13 veces
 *   en una sola carga de la home. Cada call ~460ms. Causa raíz: múltiples
 *   componentes (ExplorarPorSector, SearchSuggestions, ProductQuickView,
 *   StoreQuickPreviewDrawer, app/marketplace/page.tsx, etc.) montaban al
 *   mismo tiempo y cada uno disparaba su propio fetch.
 *
 * Patrón:
 *   - In-flight singleton promise por URL (cache key = phone)
 *   - sessionStorage TTL 60s para repeat visits dentro de la misma SPA session
 *   - Multiples consumers que monten en la misma "ventana de fetch" comparten
 *     la misma Promise. Cuando resuelve, todos se setean al mismo valor.
 *
 * Mismo template que `useCustomerAuthStatus` (commit 07cb98a2 validado).
 */

import { useEffect, useState } from "react";

const CACHE_KEY_PREFIX = "buleje:chat:";
const CACHE_TTL_MS = 60 * 1000;

interface CachedEntry<T> {
  data: T;
  ts: number;
}

interface ChatResponse {
  customerName?: string | null;
  recentOrders?: number;
  lastOrderAt?: string | null;
  loyaltyTier?: string | null;
  [key: string]: unknown;
}

interface ChatState {
  data: ChatResponse | null;
  loading: boolean;
  error: Error | null;
}

function readCache(key: string): ChatResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry<ChatResponse>;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: ChatResponse): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedEntry<ChatResponse> = { data, ts: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* sessionStorage falla en modo incógnito — silencioso. */
  }
}

// Singleton in-flight promises por phone — múltiples consumers comparten.
const inFlight = new Map<string, Promise<ChatResponse | null>>();

async function fetchChatDeduped(phone: string): Promise<ChatResponse | null> {
  if (!phone) return null;
  const cacheKey = `${CACHE_KEY_PREFIX}${phone}`;

  // Cache HIT — devuelve inmediato
  const cached = readCache(cacheKey);
  if (cached) return cached;

  // In-flight HIT — esperar la misma promise
  const existing = inFlight.get(phone);
  if (existing) return existing;

  // Cache MISS + sin in-flight — crear nueva promise
  const promise = (async () => {
    try {
      const res = await fetch(`/api/chat?phone=${encodeURIComponent(phone)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as ChatResponse;
      writeCache(cacheKey, data);
      return data;
    } catch {
      return null;
    } finally {
      // Liberar el singleton tras un microtask para permitir nuevo fetch
      // si el cache no quedó persistido (modo incógnito).
      setTimeout(() => inFlight.delete(phone), 0);
    }
  })();

  inFlight.set(phone, promise);
  return promise;
}

export function useChat(phone: string | null | undefined): ChatState {
  const [data, setData] = useState<ChatResponse | null>(() => {
    if (!phone) return null;
    return readCache(`${CACHE_KEY_PREFIX}${phone}`);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!phone) {
      setData(null);
      return;
    }
    // Si ya hay cache fresco, no fetchear de nuevo
    const cached = readCache(`${CACHE_KEY_PREFIX}${phone}`);
    if (cached) {
      setData(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchChatDeduped(phone).then((result) => {
      if (cancelled) return;
      setData(result);
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(e as Error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  return { data, loading, error };
}

// Export el fetcher para uso fuera de React (server actions, etc).
export { fetchChatDeduped };
