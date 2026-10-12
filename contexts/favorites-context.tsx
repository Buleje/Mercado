"use client";

import { createContext, useContext, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { z } from "zod";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";
import { useValidatedLocalStorage } from "@/hooks/use-validated-local-storage";

/**
 * Favoritos de la tienda: UNA sola lista por negocio (2026-10-11).
 *
 * Antes había dos: el corazón del catálogo guardaba aquí (`<negocio>-favorites`)
 * y la página `/favoritos` y el menú de cuenta leían otra (`<negocio>-wishlist`,
 * `contexts/wishlist-context`), así que `/favoritos` salía siempre vacía.
 * Ahora `useWishlist` es una vista de esta lista y lo que el navegador tenía en
 * la clave vieja se suma aquí una vez y se borra (`unirConListaVieja`).
 */
type FavoritesCtx = {
  favorites: Set<string>;
  /** Ids en el orden en que se guardaron: el primero es el más viejo. */
  ids: string[];
  toggle: (productId: string) => void;
  agregar: (productId: string) => void;
  quitar: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  count: number;
};

const FavoritesContext = createContext<FavoritesCtx | null>(null);

/** Ids se guardan como array (JSON-serializable); el context expone Set para
 *  checks O(1). Zod filtra entries no-string y deduplica al hidratar. */
const FavoriteIdsSchema = z
  .array(z.unknown())
  .transform((arr) => Array.from(new Set(arr.filter((v): v is string => typeof v === "string" && v.length > 0))));

/** Clave de la lista. */
export function claveFavoritos(slug: string): string {
  return tenantKey(slug, "favorites");
}

/** Clave de la lista vieja de `/favoritos` (`{ productId, addedAt }[]`), sólo para migrarla. */
export function claveListaVieja(slug: string): string {
  return tenantKey(slug, "wishlist");
}

const ListaViejaSchema = z.array(
  z.object({ productId: z.union([z.string(), z.number()]), addedAt: z.number().optional() }).passthrough(),
);

/** Ids de la lista vieja, del más viejo al más nuevo. JSON roto o ajeno → []. */
export function idsDeListaVieja(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const r = ListaViejaSchema.safeParse(JSON.parse(raw));
    if (!r.success) return [];
    return [...r.data]
      .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))
      .map((i) => String(i.productId))
      .filter((id) => id.length > 0);
  } catch {
    return [];
  }
}

/** Suma a `actuales` los de la lista vieja que falten (los viejos, delante). Sin cambios → el mismo array. */
export function unirConListaVieja(actuales: string[], viejos: string[]): string[] {
  const faltan = viejos.filter((id, i) => !actuales.includes(id) && viejos.indexOf(id) === i);
  return faltan.length ? [...faltan, ...actuales] : actuales;
}

/**
 * Cuántos favoritos tiene guardados este navegador en un negocio, sin
 * proveedor (portada de una página propia). Cuenta también la lista vieja
 * mientras no se haya migrado.
 */
export function contarFavoritosGuardados(slug: string): number {
  try {
    const r = FavoriteIdsSchema.safeParse(JSON.parse(localStorage.getItem(claveFavoritos(slug)) ?? "[]"));
    const actuales = r.success ? r.data : [];
    return unirConListaVieja(actuales, idsDeListaVieja(localStorage.getItem(claveListaVieja(slug)))).length;
  } catch {
    return 0;
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const slug = useTenantSlug();
  const storageKey = claveFavoritos(slug);

  const [ids, setIds] = useValidatedLocalStorage<string[]>(
    storageKey,
    FavoriteIdsSchema,
    [],
  );

  // Migración de la lista vieja. Se escribe el resultado en el almacenamiento
  // ANTES de tocar el estado: así cualquier relectura del hook (otra pestaña,
  // el doble montaje de StrictMode) ya ve la lista unida. El `setIds` con
  // función corre después de la hidratación del hook (sus efectos van antes).
  useEffect(() => {
    const vieja = claveListaVieja(slug);
    let viejos: string[] = [];
    try {
      viejos = idsDeListaVieja(localStorage.getItem(vieja));
      if (!viejos.length) return;
      const r = FavoriteIdsSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
      localStorage.setItem(storageKey, JSON.stringify(unirConListaVieja(r.success ? r.data : [], viejos)));
      localStorage.removeItem(vieja);
    } catch {
      return; // almacenamiento bloqueado o JSON roto: queda como estaba
    }
    setIds((prev) => unirConListaVieja(prev, viejos));
  }, [slug, storageKey, setIds]);

  const favorites = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    (productId: string) => {
      setIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
    },
    [setIds],
  );

  const agregar = useCallback(
    (productId: string) => setIds((prev) => (prev.includes(productId) ? prev : [...prev, productId])),
    [setIds],
  );

  const quitar = useCallback(
    (productId: string) => setIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : prev)),
    [setIds],
  );

  const isFavorite = useCallback(
    (productId: string) => favorites.has(productId),
    [favorites],
  );

  return (
    <FavoritesContext.Provider
      value={{ favorites, ids, toggle, agregar, quitar, isFavorite, count: ids.length }}
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
