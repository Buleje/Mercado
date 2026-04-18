/**
 * lib/validators/socio-buleje.ts — Zod schemas para Socio Buleje.
 *
 * Membership tier + suscripción. Todo `safeParse()` (regla #2 CLAUDE.md).
 */

import { z } from "zod";

// ADR-078: el plan DB-level es "annual". Mantenemos alias "yearly" en UI
// para no romper componentes existentes — se normaliza en el DB class.
export const SocioPlanSchema = z.enum(["monthly", "yearly", "annual"]);
export type SocioPlan = z.infer<typeof SocioPlanSchema>;

/** Plan canónico en DB: monthly | annual. */
export type SocioPlanCanonical = "monthly" | "annual";

/** Normaliza alias "yearly" → "annual" para escribir a DB. */
export function canonicalPlan(plan: SocioPlan): SocioPlanCanonical {
  return plan === "yearly" ? "annual" : plan;
}

export const SubscribeBodySchema = z.object({
  plan: SocioPlanSchema,
  userId: z.string().min(1, "userId requerido"),
});
export type SubscribeBody = z.infer<typeof SubscribeBodySchema>;

export const CancelBodySchema = z.object({
  userId: z.string().min(1, "userId requerido"),
  reason: z.string().max(200).optional(),
  immediate: z.boolean().optional(),
});
export type CancelBody = z.infer<typeof CancelBodySchema>;

export const ResumeBodySchema = z.object({
  userId: z.string().min(1, "userId requerido"),
});
export type ResumeBody = z.infer<typeof ResumeBodySchema>;

export const StatusQuerySchema = z.object({
  userId: z.string().min(1, "userId requerido"),
});
export type StatusQuery = z.infer<typeof StatusQuerySchema>;

export const CashbackHistoryQuerySchema = z.object({
  userId: z.string().min(1, "userId requerido"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type CashbackHistoryQuery = z.infer<typeof CashbackHistoryQuerySchema>;

export const EarnCashbackBodySchema = z.object({
  userId: z.string().min(1),
  orderId: z.string().nullable().optional(),
  amountSoles: z.number().positive().max(100000),
  description: z.string().min(1).max(500),
});
export type EarnCashbackBody = z.infer<typeof EarnCashbackBodySchema>;

export const RedeemCashbackBodySchema = z.object({
  userId: z.string().min(1),
  orderId: z.string().nullable().optional(),
  amountSoles: z.number().positive().max(100000),
});
export type RedeemCashbackBody = z.infer<typeof RedeemCashbackBodySchema>;

// Prices as constants — en prod vendrían de DB / Stripe.
// El precio real autoritativo está en ISocioBulejeDB.SOCIO_PLAN_PRICES
// (indexado por plan canónico); este mapa mantiene el alias "yearly" para UI.
export const PLAN_PRICES = {
  monthly: 19,
  yearly: 189,
  annual: 189,
} as const;

export const TRIAL_DAYS = 30;
export const FREE_SHIPPING_THRESHOLD = 0; // Socio = delivery ilimitado
export const CASHBACK_PERCENT = 5;
