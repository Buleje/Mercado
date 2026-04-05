"use client";

import { createContext, useContext, useState, useCallback, useEffect, startTransition, type ReactNode } from "react";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";

type FavoritesCtx = {
  favorites: Set<string>;
  toggle: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  count: number;
};

const FavoritesContext = createContext<FavoritesCtx | null>(null);

function loadFavorites(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const slug = useTenantSlug();
  const storageKey = tenantKey(slug, "favorites");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    startTransition(() => {
      setFavorites(loadFavorites(storageKey));
      setHydrated(true);
    });
  }, [storageKey]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKey, JSON.stringify([...favorites]));
  }, [favorites, hydrated, storageKey]);

  const toggle = useCallback((productId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const isFavorite = useCallback((productId: string) => favorites.has(productId), [favorites]);

  return (
    <FavoritesContext.Provider value={{ favorites, toggle, isFavorite, count: favorites.size }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be inside FavoritesProvider");
  return ctx;
}
