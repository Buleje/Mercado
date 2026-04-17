/**
 * Zod schemas for Coupon validation + redemption (Ola 1 — Retención Marketplace).
 *
 * Dos etapas:
 *  1) ValidateCouponSchema — cliente prueba el código antes de checkout (preview).
 *  2) RedeemCouponSchema   — backend marca el cupón como usado al confirmar orden.
 *
 * Uppercase en `code` para que "welcome20" y "WELCOME20" sean equivalentes.
 *
 * Spec: docs/superpowers/specs/2026-04-13-ola1-compra-recurrente-design.md
 */

import { z } from "zod";

export const ValidateCouponSchema = z.object({
  code: z.string().min(3).max(30).trim().toUpperCase(),
  cartTotal: z.number().positive(),
});

export const RedeemCouponSchema = z.object({
  code: z.string().min(3).max(30).trim().toUpperCase(),
  orderId: z.string().min(1),
  discountApplied: z.number().nonnegative(),
});

export type ValidateCouponInput = z.infer<typeof ValidateCouponSchema>;
export type RedeemCouponInput = z.infer<typeof RedeemCouponSchema>;
