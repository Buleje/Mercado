/**
 * lib/events/handlers/on-order-created.ts
 *
 * Handles OrderCreated events.
 * Responsibility: invalidate cached order lists for the customer so the
 * next request fetches fresh data from the DB.
 */

import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type { OrderCreatedEvent } from "@/lib/events/types";

export async function onOrderCreated(event: OrderCreatedEvent): Promise<void> {
  const { tenantId, payload } = event;
  const { orderId, customerId } = payload;

  // Invalidate all cached order lists for this customer
  invalidateByPrefix(`orders:${tenantId}:customer:${customerId}`);

  // Also invalidate the specific order cache in case it was pre-populated
  invalidateByPrefix(`order:${tenantId}:${orderId}`);

  logger.info("[events/on-order-created] cache invalidated", {
    tenantId,
    orderId,
    customerId,
  });
}
