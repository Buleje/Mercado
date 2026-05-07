import { useCallback } from "react";
import type { CheckoutDispatch } from "./useCheckoutState";
import type { CouponState } from "../types";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * useCoupon — encapsula la validación del cupón contra
 * `POST /api/coupons/validate`. La invalidación falla amigablemente
 * sin bloquear el checkout — solo desactiva el descuento.
 */

type Args = {
  state: CouponState;
  cartTotal: number;
  dispatch: CheckoutDispatch;
};

export type UseCouponResult = {
  validate: () => Promise<void>;
  remove: () => void;
  setCode: (code: string) => void;
};

export function useCoupon({ state, cartTotal, dispatch }: Args): UseCouponResult {
  const validate = useCallback(async () => {
    const code = state.code.trim();
    if (!code) return;
    dispatch({ type: "SET_COUPON", patch: { validating: true, msg: "" } });
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ code, cartTotal }),
      });
      const data = (await res.json()) as { discount?: number; error?: string };
      if (res.ok && typeof data.discount === "number") {
        dispatch({
          type: "SET_COUPON",
          patch: {
            discount: data.discount,
            applied: true,
            msg: `¡Cupón aplicado! -S/${Number(data.discount).toFixed(2)}`,
            validating: false,
          },
        });
      } else {
        dispatch({
          type: "SET_COUPON",
          patch: {
            discount: 0,
            applied: false,
            msg: data.error || "Cupón inválido",
            validating: false,
          },
        });
      }
    } catch {
      dispatch({
        type: "SET_COUPON",
        patch: { msg: "Error al validar", validating: false },
      });
    }
  }, [state.code, cartTotal, dispatch]);

  const remove = useCallback(() => {
    dispatch({ type: "RESET_COUPON" });
  }, [dispatch]);

  const setCode = useCallback(
    (code: string) => {
      dispatch({ type: "SET_COUPON", patch: { code } });
    },
    [dispatch]
  );

  return { validate, remove, setCode };
}
