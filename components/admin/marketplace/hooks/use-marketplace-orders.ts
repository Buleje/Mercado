"use client";

import { useState, useEffect, useCallback } from "react";

export interface MarketplaceOrder {
  id: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string;
  itemsCount: number;
}

export function useMarketplaceOrders() {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/marketplace/orders")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar las órdenes del marketplace."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { orders, loading, error, load };
}
