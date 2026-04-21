"use client";

/**
 * use-cart-quantity-map — Devuelve un `Map<storeProductId, quantity>`
 * derivado del carrito marketplace. Los cards del catálogo consultan este
 * mapa (O(1)) para pintar su contador sobre el botón "Agregar al carrito".
 *
 * Preferimos un Map construido una sola vez (useMemo) sobre buscar cada
 * item con `.find()` dentro del render de cada card — con 50+ productos
 * y re-renders frecuentes por cambios de filtros, el find es O(n*m).
 */

import { useMemo } from "react";
import { useMarketplaceCart } from "./use-marketplace-cart";

export function useCartQuantityMap(): Map<string, number> {
  const { items } = useMarketplaceCart();
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      map.set(it.storeProductId, (map.get(it.storeProductId) ?? 0) + it.quantity);
    }
    return map;
  }, [items]);
}
