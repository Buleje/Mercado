"use client";

import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";
import { z } from "zod";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";
import { useValidatedLocalStorage } from "@/hooks/use-validated-local-storage";

type FavoritesCtx = {
  favorites: Set<string>;
  toggle: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  count: number;
};

const FavoritesContext = createContext<FavoritesCtx | null>(null);

/** Ids se guardan como array (JSON-serializable); el context expone Set para
 *  checks O(1). Zod filtra entries no-string y deduplica al hidratar. */
const FavoriteIdsSchema = z
  .array(z.unknown())
  .transform((arr) => Array.from(new Set(arr.filter((v): v is string => typeof v === "string" && v.length > 0))));

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const slug = useTenantSlug();
  const storageKey = tenantKey(slug, "favorites");

  const [ids, setIds] = useValidatedLocalStorage<string[]>(
    storageKey,
    FavoriteIdsSchema,
    [],
  );

  const favorites = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    (productId: string) => {
      setIds((prev) => {
        const set = new Set(prev);
        if (set.has(productId)) set.delete(productId);
        else set.add(productId);
        return Array.from(set);
      });
    },
    [setIds],
  );

  const isFavorite = useCallback(
    (productId: string) => favorites.has(productId),
    [favorites],
  );

  return (
    <FavoritesContext.Provider
      value={{ favorites, toggle, isFavorite, count: favorites.size }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be inside FavoritesProvider");
  return ctx;
}
