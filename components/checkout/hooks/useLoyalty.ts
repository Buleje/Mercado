import { useCallback } from "react";
import type { CheckoutDispatch } from "./useCheckoutState";

/**
 * useLoyalty — fetcha puntos y tier del cliente identificado por teléfono.
 * Falla en silencio: la lealtad es opcional, no debe romper el checkout.
 */

export const TIER_DISCOUNT: Record<string, number> = {
  plata: 2,
  oro: 4,
  diamante: 6,
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
        // Pre-check sesión activa: el endpoint /api/loyalty/[phone] requiere
        // customer-session firmada. Sin esto, el browser loguea un 401 en
        // cada init de checkout cuando hay phone en localStorage pero la
        // cookie expiró. Lealtad es opcional → no debe ensuciar consola.
        const auth = await fetch("/api/auth/customer/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!auth.ok) return;
        const authData = await auth.json();
        if (!authData?.authenticated) return;

        const res = await fetch(`/api/loyalty/${encodeURIComponent(clean)}`, {
          credentials: "include",
        });
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
