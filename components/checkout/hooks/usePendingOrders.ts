import { useEffect } from "react";
import type { CheckoutDispatch } from "./useCheckoutState";

/**
 * usePendingOrders — al entrar al paso "pago", consulta cuántos pedidos
 * pendientes/en camino tiene este teléfono. Solo informativo.
 */

type Args = {
  step: string;
  phone: string;
  dispatch: CheckoutDispatch;
};

export function usePendingOrders({ step, phone, dispatch }: Args) {
  useEffect(() => {
    if (step !== "pago" || !phone) return;
    let cancelled = false;

    (async () => {
      try {
        const url = `/api/orders?phone=${encodeURIComponent(phone)}&status=pendiente,confirmado,en_camino`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        dispatch({
          type: "SET_UI",
          patch: { pendingOrdersCount: Array.isArray(data) ? data.length : 0 },
        });
      } catch {
        /* silenciar */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, phone, dispatch]);
}
