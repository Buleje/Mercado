"use client";

import { useEffect, useState } from "react";

export interface LiveStats {
  activeStores: number;
  ordersToday: number;
  ordersLastHour?: number;
  activeShoppers?: number;
  isHot?: boolean;
  show: boolean;
}

const INITIAL: LiveStats = {
  activeStores: 0,
  ordersToday: 0,
  ordersLastHour: 0,
  activeShoppers: 0,
  isHot: false,
  show: false,
};

/**
 * useLiveStats — fetchea /api/stats/live.
 *
 * Uso en heros para social proof real (Cialdini). Si show=false,
 * el componente deberia esconder el indicador — nunca inventar.
 *
 * Cache SWR pattern simple sin dependencias externas.
 */
export function useLiveStats(): LiveStats {
  const [stats, setStats] = useState<LiveStats>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/live")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setStats(data);
      })
      .catch(() => { /* silent — fallback a INITIAL */ });
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
