"use client";

/**
 * useCustomerOrders — singleton cache compartido para /api/marketplace/mi-cuenta/pedidos.
 *
 * Antes (Sprint 4-6) había 3 hooks/componentes que fetcheaban el mismo
 * endpoint independientemente al mount: TusTiendasStrip, LastOrderBanner
 * y useLastOrdersByStore. Eso resultaba en 3 requests paralelos por cada
 * cliente con phone — bottleneck principal de /tiendas + /mi-cuenta.
 *
 * Esta capa unifica:
 *   - Singleton in-memory cache (Map<phone, OrderSummary[]>)
 *   - Inflight promises dedupeadas (si mientras carga llega otro consumer,
 *     comparte la misma Promise — no dispara fetch nuevo)
 *   - localStorage fallback con TTL 5min
 *   - Cross-tab sync vía storage event
 *
 * Sprint 7 — performance fixes.
 */

import { useEffect, useState } from "react";
import { useCustomer } from "@/contexts/customer-context";

export interface OrderSummary {
  id: string;
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  itemsCount: number;
  storeSlug: string;
  items: {
    productId: number;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    image?: string | null;
  }[];
  createdAt: string;
}

const LS_KEY = "customer-orders:v1";
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  ts: number;
  phone: string;
  data: OrderSummary[];
}

// ── Singleton state ──────────────────────────────────────────────────────────
const memCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OrderSummary[]>>();
const subscribers = new Set<() => void>();

function readLs(phone: string): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.phone !== phone) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLs(entry: CacheEntry) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(entry));
  } catch {
    // ignorar
  }
}

function notify() {
  for (const fn of subscribers) fn();
}

async function fetchOrders(phone: string): Promise<OrderSummary[]> {
  // 1. inflight dedupe
  const existing = inflight.get(phone);
  if (existing) return existing;

  // 2. mem cache hit
  const mem = memCache.get(phone);
  if (mem && Date.now() - mem.ts < TTL_MS) return mem.data;

  // 3. localStorage hit
  const ls = readLs(phone);
  if (ls) {
    memCache.set(phone, ls);
    return ls.data;
  }

  // 4. red
  const promise = (async () => {
    const params = new URLSearchParams({ phone, tenantId: "main" });
    const r = await fetch(`/api/marketplace/mi-cuenta/pedidos?${params}`, {
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`fetch failed ${r.status}`);
    const j = (await r.json()) as { orders?: OrderSummary[] };
    const data = Array.isArray(j.orders) ? j.orders : [];
    const entry: CacheEntry = { ts: Date.now(), phone, data };
    memCache.set(phone, entry);
    writeLs(entry);
    notify();
    return data;
  })().finally(() => {
    inflight.delete(phone);
  });

  inflight.set(phone, promise);
  return promise;
}

/**
 * Hook que devuelve los pedidos del cliente actual. Comparte el resultado
 * con todos los consumers vía singleton cache — 1 sola request por phone.
 */
export function useCustomerOrders(): {
  orders: OrderSummary[];
  loading: boolean;
} {
  const { customer } = useCustomer();
  const phone = customer?.phone ?? null;
  const [orders, setOrders] = useState<OrderSummary[]>(() => {
    if (!phone) return [];
    return memCache.get(phone)?.data ?? readLs(phone)?.data ?? [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!phone) return false;
    return !memCache.get(phone) && !readLs(phone);
  });

  useEffect(() => {
    if (!phone) {
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const tick = () => {
      const entry = memCache.get(phone);
      if (entry && !cancelled) setOrders(entry.data);
    };
    subscribers.add(tick);

    fetchOrders(phone)
      .then((data) => {
        if (cancelled) return;
        setOrders(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    // Cross-tab sync
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY) return;
      const fresh = readLs(phone);
      if (fresh && !cancelled) {
        memCache.set(phone, fresh);
        setOrders(fresh.data);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      subscribers.delete(tick);
      window.removeEventListener("storage", onStorage);
    };
  }, [phone]);

  return { orders, loading };
}
