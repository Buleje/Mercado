import { useEffect } from "react";
import type { CartItem } from "@/contexts/cart-context";
import type { CheckoutDispatch } from "./useCheckoutState";

/**
 * useStockCheck — al abrir el modal, valida que cada item del carrito
 * tenga stock disponible.
 *
 * - Items AGOTADOS (stock === 0) → BLOQUEAN el checkout (hasBlockingStockError)
 * - Items con stock bajo (stock < quantity) → WARNING visible pero no bloquea
 * - La verificación final atómica es server-side (api/orders 409 Conflict)
 */

type Args = {
  enabled: boolean;
  items: CartItem[];
  dispatch: CheckoutDispatch;
};

export function useStockCheck({ enabled, items, dispatch }: Args) {
  useEffect(() => {
    if (!enabled || items.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const ids = items.map((i) => i.id).join(",");
        const res = await fetch(`/api/products/stock-check?ids=${ids}`);
        if (!res.ok || cancelled) return;
        const data: { id: number; stock: number | null }[] = await res.json();
        const warnings: string[] = [];
        let hasBlockingError = false;

        for (const item of items) {
          const info = data.find((d) => d.id === item.id);
          if (info && info.stock !== null && item.quantity > info.stock) {
            if (info.stock === 0) {
              warnings.push(`"${item.name}" esta agotado — retiralo del carrito para continuar`);
              hasBlockingError = true;
            } else {
              warnings.push(
                `"${item.name}" solo tiene ${info.stock} en stock (tienes ${item.quantity})`
              );
            }
          }
        }
        if (!cancelled) {
          dispatch({
            type: "SET_UI",
            patch: {
              stockWarnings: warnings,
              hasBlockingStockError: hasBlockingError,
            },
          });
        }
      } catch {
        // Si la API falla, no bloqueamos — server-side catch final en api/orders
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, items, dispatch]);
}
