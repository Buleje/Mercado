"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  startTransition,
  type ReactNode,
} from "react";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";

/**
 * #17 Wishlist favoritos cross-store.
 * Persistencia en localStorage, sync opcional al backend cuando hay sesion.
 * Degrada graciosamente si no hay cliente autenticado.
 */

type WishlistItem = {
  productId: string;
  addedAt: number;
};

type WishlistCtx = {
  items: WishlistItem[];
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  count: number;
};

const WishlistContext = createContext<WishlistCtx | null>(null);

function loadItems(key: string): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as WishlistItem[];
  } catch { /* silent */ }
  return [];
}

function saveItems(key: string, items: WishlistItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch { /* silent */ }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const slug = useTenantSlug();
  const storageKey = tenantKey(slug, "wishlist");
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar desde localStorage evitando mismatch SSR
  useEffect(() => {
    startTransition(() => {
      setItems(loadItems(storageKey));
      setHydrated(true);
    });
  }, [storageKey]);

  // Persistir cambios
  useEffect(() => {
    if (hydrated) saveItems(storageKey, items);
  }, [items, hydrated, storageKey]);

  const addToWishlist = useCallback((productId: string) => {
    setItems((prev) => {
      if (prev.some((i) => i.productId === productId)) return prev;
      return [...prev, { productId, addedAt: Date.now() }];
    });
  }, []);

  const removeFromWishlist = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const isInWishlist = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items]
  );

  return (
    <WishlistContext.Provider
      value={{ items, addToWishlist, removeFromWishlist, isInWishlist, count: items.length }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be inside WishlistProvider");
  return ctx;
}
