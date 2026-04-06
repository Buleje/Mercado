import { useEffect } from "react";
import type { CartItem } from "@/contexts/cart-context";
import type { CheckoutDispatch } from "./useCheckoutState";

/**
 * useStockCheck — al abrir el modal, valida que cada item del carrito
 * tenga stock disponible. Genera warnings que se muestran en UI sin
 * bloquear el checkout (la verificación final se hace server-side).
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
        for (const item of items) {
          const info = data.find((d) => d.id === item.id);
          if (info && info.stock !== null && item.quantity > info.stock) {
            warnings.push(
              info.stock === 0
                ? `"${item.name}" está agotado`
                : `"${item.name}" solo tiene ${info.stock} en stock (tienes ${item.quantity})`
            );
          }
        }
        if (!cancelled) {
          dispatch({ type: "SET_UI", patch: { stockWarnings: warnings } });
        }
      } catch {
        /* no bloqueamos checkout si la API falla */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, items, dispatch]);
}
