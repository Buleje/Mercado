/**
 * lib/events/handlers/on-stock-low.ts
 *
 * Handles StockLow events.
 * Current behavior: console.log stub.
 *
 * TODO (Roadmap): replace stub with real notification:
 *   - WhatsApp alert to store owner via lib/whatsapp/
 *   - Push notification via VAPID
 *   - Insert into notifications table
 */

import { logger } from "@/lib/logger";
import type { StockLowEvent } from "@/lib/events/types";

export async function onStockLow(event: StockLowEvent): Promise<void> {
  const { tenantId, payload } = event;
  const { productId, sku, currentStock, threshold } = payload;

  // STUB — real notification not yet implemented
  logger.warn("[events/on-stock-low] stock below threshold", {
    tenantId,
    productId,
    sku,
    currentStock,
    threshold,
  });

  // TODO: send WhatsApp alert when lib/whatsapp/ supports templated stock alerts
  // await sendWhatsappAlert(tenantId, { productId, sku, currentStock, threshold });
}
