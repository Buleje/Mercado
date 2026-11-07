"use client";

import { useMemo } from "react";
import { useFavorites } from "@/contexts/favorites-context";

/**
 * Vista de los favoritos de la tienda con forma de «lista de deseos»
 * (`{ productId, addedAt }`), para `/favoritos` y el menú de cuenta.
 *
 * NO guarda nada propio (2026-10-11): antes tenía su lista aparte
 * (`<negocio>-wishlist`) y el corazón del catálogo guardaba en
 * `contexts/favorites-context`, así que `/favoritos` salía siempre vacía.
 * La única lista es la de `FavoritesProvider`, que además migra la vieja.
 *
 * `addedAt` es el orden de guardado (0 = el más viejo), no una fecha: sólo
 * sirve para ordenar «más recientes / más antiguos».
 */

export type WishlistItem = {
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

export function useWishlist(): WishlistCtx {
  const { ids, agregar, quitar, isFavorite, count } = useFavorites();
  const items = useMemo(() => ids.map((productId, addedAt) => ({ productId, addedAt })), [ids]);
  return { items, addToWishlist: agregar, removeFromWishlist: quitar, isInWishlist: isFavorite, count };
}
