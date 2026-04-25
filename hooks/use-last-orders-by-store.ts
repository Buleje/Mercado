"use client";

/**
 * useLastOrdersByStore — TS-08 mapa storeSlug → último pedido del cliente.
 *
 * Sprint 7: deja de fetchear directo y consume `useCustomerOrders` (singleton)
 * — un solo request compartido entre TusTiendasStrip + LastOrderBanner +
 * useLastOrdersByStore.
 */

import { useEffect, useMemo, useState } from "react";
import { useCustomerOrders } from "@/hooks/use-customer-orders";

export interface LastOrderInfo {
  daysAgo: number;
  orderId: string;
}

export function useLastOrdersByStore(): Record<string, LastOrderInfo> {
  const { orders } = useCustomerOrders();
  // `now` se refresca cada minuto para que "Pediste hace X días"
  // recompute al cruzar la medianoche sin requerir nav. Date.now() vive
  // en el effect, no durante render — cumple react-hooks/purity.
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const next: Record<string, LastOrderInfo> = {};
    if (now === 0) return next;
    for (const o of orders) {
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
    return next;
  }, [orders, now]);
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
