/**
 * lib/events/types.ts
 *
 * Discriminated union for all domain events published through EventBus.
 * Distinct from lib/domain-events/ (BullMQ-backed legacy bus) and lib/events.ts
 * (client-side DOM CustomEvents).
 *
 * Rules:
 * - Every event carries tenantId (multi-tenant isolation)
 * - occurredAt is ISO 8601, assigned by createEvent()
 * - All payloads validated with Zod schemas
 */

import { z } from "zod";

// ─── Per-event Zod schemas ────────────────────────────────────────────────────

export const OrderCreatedPayloadSchema = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  totalPen: z.number().nonnegative(),
});

export const PaymentSettledPayloadSchema = z.object({
  orderId: z.string().min(1),
  provider: z.enum(["culqi", "izipay", "mercadopago", "pagoefectivo"]),
  externalId: z.string().min(1),
  amountPen: z.number().nonnegative(),
});

export const StockLowPayloadSchema = z.object({
  productId: z.string().min(1),
  sku: z.string().min(1),
  currentStock: z.number().int().nonnegative(),
  threshold: z.number().int().nonnegative(),
});

// ─── Base event schema ────────────────────────────────────────────────────────

const BaseEventSchema = z.object({
  tenantId: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export const OrderCreatedSchema = BaseEventSchema.extend({
  type: z.literal("OrderCreated"),
  payload: OrderCreatedPayloadSchema,
});

export const PaymentSettledSchema = BaseEventSchema.extend({
  type: z.literal("PaymentSettled"),
  payload: PaymentSettledPayloadSchema,
});

export const StockLowSchema = BaseEventSchema.extend({
  type: z.literal("StockLow"),
  payload: StockLowPayloadSchema,
});

// ─── Discriminated union ──────────────────────────────────────────────────────

export const DomainEventSchema = z.discriminatedUnion("type", [
  OrderCreatedSchema,
  PaymentSettledSchema,
  StockLowSchema,
]);

export type OrderCreatedPayload = z.infer<typeof OrderCreatedPayloadSchema>;
export type PaymentSettledPayload = z.infer<typeof PaymentSettledPayloadSchema>;
export type StockLowPayload = z.infer<typeof StockLowPayloadSchema>;

export type OrderCreatedEvent = z.infer<typeof OrderCreatedSchema>;
export type PaymentSettledEvent = z.infer<typeof PaymentSettledSchema>;
export type StockLowEvent = z.infer<typeof StockLowSchema>;

/**
 * Discriminated union of all events supported by EventBus.
 * Add new events here — TypeScript enforces exhaustiveness in switch statements.
 */
export type DomainEvent = z.infer<typeof DomainEventSchema>;

// ─── createEvent helper ───────────────────────────────────────────────────────

type EventPayloadMap = {
  OrderCreated: OrderCreatedPayload;
  PaymentSettled: PaymentSettledPayload;
  StockLow: StockLowPayload;
};

/**
 * Build a fully-formed DomainEvent, injecting occurredAt automatically.
 * Uses safeParse to validate the payload before returning.
 *
 * @throws Error if the payload fails Zod validation (dev-time guard).
 * In production callers should validate beforehand.
 */
export function createEvent<T extends DomainEvent["type"]>(
  type: T,
  tenantId: string,
  payload: EventPayloadMap[T],
): Extract<DomainEvent, { type: T }> {
  const raw = {
    type,
    tenantId,
    occurredAt: new Date().toISOString(),
    payload,
  };

  const result = DomainEventSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[events/createEvent] Invalid payload for ${type}: ${result.error.message}`,
    );
  }

  return result.data as Extract<DomainEvent, { type: T }>;
}
