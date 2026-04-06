import { useCallback } from "react";
import type { CheckoutDispatch } from "./useCheckoutState";

/**
 * useLoyalty — fetcha puntos y tier del cliente identificado por teléfono.
 * Falla en silencio: la lealtad es opcional, no debe romper el checkout.
 */

export const TIER_DISCOUNT: Record<string, number> = {
  plata: 2,
  oro: 4,
  diamante: 7,
};

/**
 * Devuelve el % de descuento que aplica el tier (0 si no hay tier conocido).
 */
export function getTierDiscountPct(tier: string | null): number {
  if (!tier) return 0;
  return TIER_DISCOUNT[tier] ?? 0;
}

export function useLoyalty(dispatch: CheckoutDispatch) {
  const fetchPoints = useCallback(
    async (phone: string) => {
      const clean = phone.replace(/\D/g, "").slice(-9);
      if (clean.length < 6) return;
      try {
        const res = await fetch(`/api/loyalty/${encodeURIComponent(clean)}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          loyaltyPoints?: number;
          loyaltyTier?: string;
        };
        dispatch({
          type: "SET_LOYALTY",
          patch: {
            points: data.loyaltyPoints ?? null,
            tier: data.loyaltyTier ?? null,
          },
        });
      } catch {
        /* lealtad es opcional — silenciar errores */
      }
    },
    [dispatch]
  );

  return { fetchPoints };
}
