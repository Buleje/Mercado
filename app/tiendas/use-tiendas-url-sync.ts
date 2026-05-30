"use client";

/**
 * useTiendasUrlSync — sincroniza el estado de filtros de /tiendas hacia la URL
 * (querystring), con debounce de 220ms.
 *
 * Audit #12 (decomposición TiendasClient): aísla el concern de URL-sync que
 * vivía inline en el God-component. Lógica movida VERBATIM (mismo debounce,
 * mismo skip-first-render, mismas deps) — sin cambio de comportamiento.
 *
 * Brandon 2026-05-18 perf P0 #1: debounce 220ms. Antes cada keystroke del
 * input "buscar" disparaba router.replace inmediato → en Next 16 re-render del
 * segmento + re-proceso de params (cascada a MarketplaceStoresView). El sync
 * espera 220ms tras la última pulsación; los cambios de chip/zone/cat son
 * inmediatos en UI (state local) y la URL se actualiza tras la pausa.
 */

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { QuickChipId } from "@/components/marketplace/QuickFilterChips";
import type { StoresSortKey } from "@/components/marketplace/StoresSortSelector";

export interface TiendasUrlState {
  search: string;
  category: string;
  zone: string;
  sortKey: StoresSortKey;
  activeChips: Set<QuickChipId>;
  subCategoryId: string | null;
  /** Zona que viene del path (/tiendas/[zona]) — no se duplica en la query. */
  initialZone?: string;
}

export function useTiendasUrlSync({
  search,
  category,
  zone,
  sortKey,
  activeChips,
  subCategoryId,
  initialZone,
}: TiendasUrlState): void {
  const router = useRouter();
  const pathname = usePathname();
  const initialSyncDone = useRef(false);

  useEffect(() => {
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      return;
    }
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (category !== "todos") params.set("cat", category);
      // En /tiendas/[zona] no duplicamos zona en la query — viene del path.
      if (zone && zone !== initialZone) params.set("zona", zone);
      if (sortKey !== "relevance") params.set("sort", sortKey);
      if (activeChips.size > 0) params.set("chips", [...activeChips].join(","));
      if (subCategoryId) params.set("subcat", subCategoryId);
      const qs = params.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      router.replace(next, { scroll: false });
    }, 220);
    return () => clearTimeout(timeout);
  }, [search, category, zone, sortKey, activeChips, subCategoryId, pathname, router, initialZone]);
}
