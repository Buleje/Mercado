"use client";

import { useCallback } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

export interface RecentViewedItem {
  productId: number;
  storeSlug: string;
  storeName: string;
  name: string;
  price: number;
  image: string | null;
  viewedAt: number;
}

const KEY = "marketplace:recent-viewed:v1";
const MAX = 12;

export function useRecentViewed() {
  const [items, setItems] = useLocalStorage<RecentViewedItem[]>(KEY, []);

  const track = useCallback(
    (item: Omit<RecentViewedItem, "viewedAt">) => {
      setItems((prev) => {
        const filtered = prev.filter(
          (i) => !(i.productId === item.productId && i.storeSlug === item.storeSlug),
        );
        const next: RecentViewedItem = { ...item, viewedAt: Date.now() };
        return [next, ...filtered].slice(0, MAX);
      });
    },
    [setItems],
  );

  const clear = useCallback(() => setItems([]), [setItems]);

  return { items, track, clear, count: items.length };
}
