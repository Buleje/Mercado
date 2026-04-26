"use client";

/**
 * useMarketplaceNavMode — hook reactivo para leer el modo activo del marketplace
 * (full / tiendas-only / minimo / custom). Re-suscribe a cambios via custom
 * event `buleje:nav-visibility-changed`.
 */

import { useEffect, useState } from "react";
import {
  detectMarketplaceNavMode,
  subscribeNavVisibility,
  type MarketplaceNavMode,
} from "@/lib/nav-visibility";

export function useMarketplaceNavMode(): MarketplaceNavMode | null {
  const [mode, setMode] = useState<MarketplaceNavMode | null>(null);

  useEffect(() => {
    const sync = () => setMode(detectMarketplaceNavMode());
    sync();
    const unsub = subscribeNavVisibility(sync);
    return unsub;
  }, []);

  return mode;
}
