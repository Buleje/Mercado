"use client";

import { useCallback } from "react";
import { useMarketplaceCart, type CartItem } from "@/hooks/use-marketplace-cart";
import { useAddedToCartDrawer } from "@/components/marketplace/AddedToCartDrawer";

type AddItemArg = Omit<CartItem, "quantity"> & {
  quantity?: number;
  /** Descripcion opcional para mostrar en el drawer. */
  description?: string | null;
  /** Variaciones a renderizar en el drawer. */
  variations?: Array<{ label: string; value: string }>;
};

export interface UseCartWithUndoReturn {
  addItemWithUndo: (item: AddItemArg) => void;
}

/**
 * Wraps useMarketplaceCart.addItem con el drawer lateral de confirmacion.
 *
 * Comportamiento:
 * - Llama addItem normalmente
 * - Abre el drawer lateral (<AddedToCartDrawer>) mostrando imagen, nombre,
 *   detalles, variaciones y contador de cantidad en vivo.
 *
 * Constraints:
 * - No modifica el estado interno de useMarketplaceCart
 * - No toca checkout/**
 */
export function useCartWithUndo(): UseCartWithUndoReturn {
  const { addItem } = useMarketplaceCart();
  const { open: openDrawer } = useAddedToCartDrawer();

  const addItemWithUndo = useCallback(
    (item: AddItemArg) => {
      const { description, variations, ...forCart } = item;
      addItem(forCart);

      // Si el cliente eligio modifiers en el ProductModifierModal, los
      // mapeamos a la prop `variations` del drawer para que se muestren.
      // Las variations explicitas (legacy) tienen prioridad.
      const drawerVariations =
        variations ??
        (item.modifiers && item.modifiers.length > 0
          ? item.modifiers.map((m) => ({
              label: m.groupName,
              value:
                m.priceDelta > 0
                  ? `${m.optionName} (+S/${m.priceDelta.toFixed(2)})`
                  : m.optionName,
            }))
          : undefined);

      openDrawer({
        storeId: item.storeId,
        storeName: item.storeName,
        storeSlug: item.storeSlug,
        productId: item.productId,
        storeProductId: item.storeProductId,
        name: item.name,
        price: item.price,
        image: item.image,
        unit: item.unit,
        description: description ?? null,
        variations: drawerVariations,
      });
    },
    [addItem, openDrawer]
  );

  return { addItemWithUndo };
}
