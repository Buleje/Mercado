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
  type CheckoutPaymentMethod,
  type CheckoutCouponEntry,
  type CheckoutCoupons,
  type CheckoutLoyalty,
  type CheckoutStoreProof,
  type CheckoutPaymentProofs,
} from "@/contexts/checkout-data-context";
