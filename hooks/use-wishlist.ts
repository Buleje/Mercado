"use client";

import { useCallback } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

export interface WishlistItem {
  productId: number;
  storeSlug: string;
  storeName: string;
  name: string;
  price: number;
  image: string | null;
  addedAt: number;
}

const KEY = "marketplace:wishlist:v1";

export function useWishlist() {
  const [items, setItems] = useLocalStorage<WishlistItem[]>(KEY, []);

  const isInWishlist = useCallback(
    (productId: number, storeSlug: string) =>
      items.some((i) => i.productId === productId && i.storeSlug === storeSlug),
    [items],
  );

  const toggle = useCallback(
    (item: Omit<WishlistItem, "addedAt">) => {
      setItems((prev) => {
        const exists = prev.some(
          (i) => i.productId === item.productId && i.storeSlug === item.storeSlug,
        );
        if (exists) {
          return prev.filter(
            (i) => !(i.productId === item.productId && i.storeSlug === item.storeSlug),
          );
        }
        const next: WishlistItem = { ...item, addedAt: Date.now() };
        return [next, ...prev].slice(0, 100);
      });
    },
    [setItems],
  );

  const remove = useCallback(
    (productId: number, storeSlug: string) => {
      setItems((prev) =>
        prev.filter(
          (i) => !(i.productId === productId && i.storeSlug === storeSlug),
        ),
      );
    },
    [setItems],
  );

  const clear = useCallback(() => setItems([]), [setItems]);

  return { items, isInWishlist, toggle, remove, clear, count: items.length };
}
