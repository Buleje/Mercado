/**
 * lib/events/handlers/on-payment-settled.ts
 *
 * Handles PaymentSettled events.
 * Responsibilities:
 * 1. Invalidate the order cache (payment status changed)
 * 2. Log activity via activity-logger (fire-and-forget)
 */

import { invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import type { PaymentSettledEvent } from "@/lib/events/types";

export async function onPaymentSettled(event: PaymentSettledEvent): Promise<void> {
  const { tenantId, payload } = event;
  const { orderId, provider, externalId, amountPen } = payload;

  // 1. Invalidate cached order data — status changed to paid
  invalidateByPrefix(`order:${tenantId}:${orderId}`);
  invalidateByPrefix(`orders:${tenantId}`);

  logger.info("[events/on-payment-settled] cache invalidated", {
    tenantId,
    orderId,
    provider,
  });

  // 2. Log activity — fire-and-forget, never break the handler
  logActivity(
    "payment_settled",
    "order",
    `Pago recibido via ${provider} — S/ ${amountPen.toFixed(2)} (ext: ${externalId})`,
    orderId,
    "system",
    undefined,
    tenantId,
  ).catch((err) => console.error("[on-payment-settled] logActivity failed", String(err)));
}
