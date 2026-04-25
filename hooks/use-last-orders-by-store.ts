"use client";

/**
 * useLastOrdersByStore — TS-08 mapa storeSlug → último pedido del cliente.
 *
 * Reusa /api/marketplace/mi-cuenta/pedidos (ya enriquecido con storeSlug en
 * Sprint 3). Cachea en memoria + localStorage para tabs subsiguientes.
 *
 * Sprint 6 marketplace blueprint.
 */

import { useEffect, useState } from "react";
import { useCustomer } from "@/contexts/customer-context";

export interface LastOrderInfo {
  daysAgo: number;
  orderId: string;
}

const LS_KEY = "last-orders-by-store:v1";
const TTL_MS = 5 * 60 * 1000;

interface CacheShape {
  ts: number;
  phone: string;
  data: Record<string, LastOrderInfo>;
}

interface PedidoSummary {
  id: string;
  storeSlug?: string;
  createdAt: string;
}

function readCache(): CacheShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed.ts || Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: CacheShape) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    // ignorar
  }
}

export function useLastOrdersByStore(): Record<string, LastOrderInfo> {
  const { customer } = useCustomer();
  const phone = customer?.phone;
  const [map, setMap] = useState<Record<string, LastOrderInfo>>(() => {
    const c = readCache();
    return c?.data ?? {};
  });

  useEffect(() => {
    if (!phone) {
      setMap({});
      return;
    }
    const cached = readCache();
    if (cached && cached.phone === phone) {
      setMap(cached.data);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ phone, tenantId: "main" });
    fetch(`/api/marketplace/mi-cuenta/pedidos?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((data: { orders?: PedidoSummary[] }) => {
        if (cancelled) return;
        const next: Record<string, LastOrderInfo> = {};
        const now = Date.now();
        for (const o of data.orders ?? []) {
          const slug = o.storeSlug;
          if (!slug || !o.createdAt) continue;
          const t = new Date(o.createdAt).getTime();
          if (Number.isNaN(t)) continue;
          const daysAgo = Math.floor((now - t) / 86_400_000);
          const prev = next[slug];
          if (!prev || daysAgo < prev.daysAgo) {
            next[slug] = { daysAgo, orderId: o.id };
          }
        }
        setMap(next);
        writeCache({ ts: Date.now(), phone, data: next });
      })
      .catch(() => {
        // silencioso — sin badge
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  return map;
}

export function formatDaysAgo(daysAgo: number): string {
  if (daysAgo === 0) return "Pediste hoy";
  if (daysAgo === 1) return "Pediste ayer";
  if (daysAgo < 7) return `Pediste hace ${daysAgo} d`;
  if (daysAgo < 14) return "Pediste hace 1 sem";
  if (daysAgo < 30) return `Pediste hace ${Math.floor(daysAgo / 7)} sem`;
  if (daysAgo < 365) return `Pediste hace ${Math.floor(daysAgo / 30)} mes`;
  return "Pediste hace +1 año";
}
