"use client";

import { useState, useEffect, useCallback } from "react";

export interface MarketplaceKPIs {
  publishedProducts: number;
  monthOrders: number;
  pendingCommissions: number;
}

const DEFAULT_KPIS: MarketplaceKPIs = {
  publishedProducts: 0,
  monthOrders: 0,
  pendingCommissions: 0,
};

export function useMarketplaceKpis() {
  const [kpis, setKpis] = useState<MarketplaceKPIs>(DEFAULT_KPIS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/api/marketplace/kpis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setKpis(d as MarketplaceKPIs); })
      .catch((err) => { /* fire-and-forget */ void err; })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { kpis, loading, refresh };
}
