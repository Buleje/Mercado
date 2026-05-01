"use client";

/**
 * useCheckoutData — re-export from context (ADR: lifted state to layout
 * to fix the hydration race that caused entrega→confirmar to redirect
 * to /datos).
 *
 * Old behaviour (per-page useState reading localStorage) lived here. New
 * canonical home: `contexts/checkout-data-context.tsx`. Keeping this file
 * as compat shim so existing imports keep working.
 */
export {
  useCheckoutData,
  type CheckoutCustomer,
  type CheckoutAddress,
  type CheckoutPayment,
  type CheckoutCouponEntry,
  type CheckoutCoupons,
  type CheckoutLoyalty,
} from "@/contexts/checkout-data-context";
