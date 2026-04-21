"use client";

import { useCallback } from "react";
import { useValidatedLocalStorage } from "@/hooks/use-validated-local-storage";
import {
  MarketplaceRecentViewedArraySchema,
  type MarketplaceRecentViewedEntry,
} from "@/lib/validations/local-storage-extra.schema";

export type RecentViewedItem = MarketplaceRecentViewedEntry;

const KEY = "marketplace:recent-viewed:v1";
const MAX = 12;

export function useRecentViewed() {
  const [items, setItems] = useValidatedLocalStorage<RecentViewedItem[]>(
    KEY,
    MarketplaceRecentViewedArraySchema,
    [],
  );

  const track = useCallback(
    (item: Omit<RecentViewedItem, "viewedAt">) => {
      setItems((prev) => {
        const filtered = prev.filter(
          (i) => !(i.productId === item.productId && i.storeSlug === item.storeSlug),
        );
        const next: RecentViewedItem = {
          ...item,
          // Defensa: si el caller pasa price string por legacy, lo coercionamos
          // aquí antes de persistir. Evita repoblar localStorage con basura.
          price: Number(item.price) || 0,
          viewedAt: Date.now(),
        };
        return [next, ...filtered].slice(0, MAX);
      });
    },
    [setItems],
  );

  const clear = useCallback(() => setItems([]), [setItems]);

  return { items, track, clear, count: items.length };
}
