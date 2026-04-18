/**
 * order-tracking-events.ts — Stubs fire-and-forget para los eventos del pipeline
 * de tracking Amazon-style.
 *
 * Reemplazar con integraciones reales (`lib/whatsapp.ts`, `lib/mailer.ts`,
 * `lib/push-sender.ts`) cuando ADR-XXX defina el contrato.
 *
 * Regla CLAUDE.md #7: fire-and-forget con `.catch(() => {})` en cada caller.
 * Regla #6: totales siempre desde backend — aquí nunca recalculamos.
 */

import { logger } from "@/lib/logger";

export interface OrderTrackingEventOrder {
  id: string;
  tenantId: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName: string;
  total: number;
  trackingUrl?: string; // link público firmado — generado por OrderTrackingDB.generateShareToken
}

/**
 * Se dispara cuando el pedido pasa a "shipping". Envía WhatsApp + email con el
 * link público de tracking.
 */
export async function notifyOrderShipped(order: OrderTrackingEventOrder): Promise<void> {
  // TODO(ADR-XXX): integrar sendWhatsAppNotification + sendEmail real.
  logger.info("[tracking-events] notifyOrderShipped (stub)", {
    orderId: order.id,
    tenantId: order.tenantId,
    phone: order.customerPhone ? "***" + order.customerPhone.slice(-4) : null,
    trackingUrl: order.trackingUrl,
  });
  // MOCK: reemplazar con real ops tras ADR-XXX
}

/**
 * Se dispara cuando el repartidor está a <2km del destino.
 * Push notification + WhatsApp corto "Tu pedido está cerca".
 */
export async function notifyOrderNearby(order: OrderTrackingEventOrder): Promise<void> {
  logger.info("[tracking-events] notifyOrderNearby (stub)", {
    orderId: order.id,
    tenantId: order.tenantId,
  });
  // MOCK: reemplazar con real ops tras ADR-XXX
}

/**
 * Se dispara al confirmar entrega. Envía encuesta NPS + recibo final.
 */
export async function notifyOrderDelivered(order: OrderTrackingEventOrder): Promise<void> {
  logger.info("[tracking-events] notifyOrderDelivered (stub)", {
    orderId: order.id,
    tenantId: order.tenantId,
    total: order.total,
  });
  // MOCK: reemplazar con real ops tras ADR-XXX
}
