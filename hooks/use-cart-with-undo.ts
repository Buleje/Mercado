"use client";

import { useCallback } from "react";
import { useMarketplaceCart, type CartItem } from "@/hooks/use-marketplace-cart";
import { useToast } from "@/hooks/use-toast";

type AddItemArg = Omit<CartItem, "quantity"> & { quantity?: number };

export interface UseCartWithUndoReturn {
  addItemWithUndo: (item: AddItemArg) => void;
}

/**
 * Wraps useMarketplaceCart.addItem con un toast de deshacer.
 *
 * Comportamiento:
 * - Llama addItem normalmente
 * - Muestra toast "Agregado al carrito" con boton "Deshacer"
 * - Auto-dismiss a los 3 000 ms
 * - Si el usuario hace click en Deshacer dentro del plazo,
 *   llama removeItem({ storeId, productId }) y descarta el toast
 *
 * Constraints:
 * - No modifica el estado interno de useMarketplaceCart
 * - No toca checkout/**
 */
export function useCartWithUndo(): UseCartWithUndoReturn {
  const { addItem, removeItem } = useMarketplaceCart();
  const { success } = useToast();

  const addItemWithUndo = useCallback(
    (item: AddItemArg) => {
      addItem(item);

      success("Agregado al carrito", {
        duration: 3000,
        action: {
          label: "Deshacer",
          onClick: () => {
            removeItem(item.storeId, item.productId);
          },
        },
      });
    },
    [addItem, removeItem, success]
  );

  return { addItemWithUndo };
}
