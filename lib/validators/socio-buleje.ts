/**
 * lib/validators/socio-buleje.ts — Zod schemas para Socio Buleje.
 *
 * Membership tier + suscripción. Todo `safeParse()` (regla #2 CLAUDE.md).
 */

import { z } from "zod";

export const SocioPlanSchema = z.enum(["monthly", "yearly"]);
export type SocioPlan = z.infer<typeof SocioPlanSchema>;

export const SubscribeBodySchema = z.object({
  plan: SocioPlanSchema,
  userId: z.string().min(1, "userId requerido"),
});
export type SubscribeBody = z.infer<typeof SubscribeBodySchema>;

export const CancelBodySchema = z.object({
  userId: z.string().min(1, "userId requerido"),
  reason: z.string().max(200).optional(),
});
export type CancelBody = z.infer<typeof CancelBodySchema>;

export const StatusQuerySchema = z.object({
  userId: z.string().min(1, "userId requerido"),
});
export type StatusQuery = z.infer<typeof StatusQuerySchema>;

// Prices as constants — in prod vendrían de DB / Stripe.
export const PLAN_PRICES = {
  monthly: 19,
  yearly: 189,
} as const;

export const TRIAL_DAYS = 30;
export const FREE_SHIPPING_THRESHOLD = 0; // Socio = delivery ilimitado
export const CASHBACK_PERCENT = 5;
