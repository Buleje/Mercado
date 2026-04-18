/**
 * order-tracking.ts — Zod schemas para tracking post-compra.
 *
 * Uso: safeParse() siempre (regla CLAUDE.md #2).
 */
import { z } from "zod";

export const TrackingStatusEnum = z.enum([
  "confirmed",
  "preparing",
  "shipping",
  "nearby",
  "delivered",
  "canceled",
]);
export type TrackingStatusZ = z.infer<typeof TrackingStatusEnum>;

export const OrderIdParamSchema = z.object({
  orderId: z.string().min(3).max(80),
});

export const TenantTokenParamSchema = z.object({
  tenant: z.string().min(1).max(60),
  token: z.string().min(16).max(512),
});

export const ShareTokenRequestSchema = z.object({
  orderId: z.string().min(3).max(80),
  // TTL opcional en segundos (default 72h)
  ttlSeconds: z.number().int().min(300).max(72 * 60 * 60).optional(),
});

export type OrderIdParam = z.infer<typeof OrderIdParamSchema>;
export type TenantTokenParam = z.infer<typeof TenantTokenParamSchema>;
export type ShareTokenRequest = z.infer<typeof ShareTokenRequestSchema>;
