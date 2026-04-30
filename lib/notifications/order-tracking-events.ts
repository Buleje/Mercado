/**
 * order-tracking-events.ts — Eventos del pipeline de tracking de pedidos.
 *
 * Antes (P1 Bug Hunter Report 2026-04-30) eran stubs `logger.info` sin
 * efecto real — los clientes nunca recibian notificaciones cuando el
 * pedido pasaba a "shipping", "nearby" o "delivered".
 *
 * Ahora dispara WhatsApp + Push (cuando hay phone) y queda preparado
 * para email cuando se implemente `lib/mailer-customer.ts`.
 *
 * Reglas:
 *   #7 fire-and-forget: cada notificación captura sus propios errores
 *      con logger.warn — nunca lanza ni rompe el caller.
 *   #6 totales server-side: nunca recalculamos.
 */

import "server-only";
import { logger } from "@/lib/logger";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";

export interface OrderTrackingEventOrder {
  id: string;
  tenantId: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName: string;
  total: number;
  trackingUrl?: string;
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

function fmtSoles(n: number): string {
  return `S/${n.toFixed(2)}`;
}

/** WhatsApp helper que captura errores y registra. */
async function sendWaSafe(phone: string, message: string, ctx: Record<string, unknown>): Promise<void> {
  try {
    const ok = await sendWhatsAppText(phone, message);
    if (!ok) {
      logger.debug("[tracking-events] whatsapp skipped (no API config)", ctx);
    }
  } catch (err) {
    logger.warn("[tracking-events] whatsapp failed", {
      ...ctx,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function sendPushSafe(phone: string, payload: Parameters<typeof sendPushToPhone>[1], ctx: Record<string, unknown>): Promise<void> {
  try {
    await sendPushToPhone(phone, payload);
  } catch (err) {
    logger.warn("[tracking-events] push failed", {
      ...ctx,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Se dispara cuando el pedido pasa a "shipping". Envía WhatsApp con tracking
 * URL + push. Email queda como TODO hasta que mailer-customer.ts esté listo.
 */
export async function notifyOrderShipped(order: OrderTrackingEventOrder): Promise<void> {
  const ctx = { event: "shipped", orderId: order.id, tenantId: order.tenantId };
  logger.info("[tracking-events] notifyOrderShipped", ctx);

  if (!order.customerPhone) return;

  const link = order.trackingUrl ?? `/pedido/${order.id}`;
  const wa =
    `🚚 *Tu pedido está en camino*\n` +
    `Pedido #${shortId(order.id)}\n` +
    `Hola *${order.customerName}* 👋 — el repartidor salió hacia tu dirección.\n` +
    `Total: ${fmtSoles(order.total)}\n\n` +
    `Seguilo en vivo: ${link}`;

  await Promise.all([
    sendWaSafe(order.customerPhone, wa, ctx),
    sendPushSafe(
      order.customerPhone,
      {
        title: "🚚 Tu pedido está en camino",
        body: `Pedido #${shortId(order.id)} — ${fmtSoles(order.total)}`,
        url: link,
      },
      ctx,
    ),
  ]);
}

/**
 * Se dispara cuando el repartidor está a <2km. Push + WhatsApp corto.
 */
export async function notifyOrderNearby(order: OrderTrackingEventOrder): Promise<void> {
  const ctx = { event: "nearby", orderId: order.id, tenantId: order.tenantId };
  logger.info("[tracking-events] notifyOrderNearby", ctx);

  if (!order.customerPhone) return;

  const link = order.trackingUrl ?? `/pedido/${order.id}`;
  const wa =
    `📍 *¡Tu pedido está cerca!*\n` +
    `Pedido #${shortId(order.id)}\n` +
    `El repartidor llegará en pocos minutos. Andá preparando el pago si es contra-entrega.\n\n` +
    `${link}`;

  await Promise.all([
    sendWaSafe(order.customerPhone, wa, ctx),
    sendPushSafe(
      order.customerPhone,
      {
        title: "📍 Tu pedido está cerca",
        body: `Pedido #${shortId(order.id)} — el repartidor llegará pronto`,
        url: link,
      },
      ctx,
    ),
  ]);
}

/**
 * Se dispara al confirmar entrega. WhatsApp con encuesta NPS + push.
 */
export async function notifyOrderDelivered(order: OrderTrackingEventOrder): Promise<void> {
  const ctx = { event: "delivered", orderId: order.id, tenantId: order.tenantId };
  logger.info("[tracking-events] notifyOrderDelivered", { ...ctx, total: order.total });

  if (!order.customerPhone) return;

  const reviewLink = `/pedido/${order.id}?action=review`;
  const wa =
    `✅ *¡Pedido entregado!*\n` +
    `Pedido #${shortId(order.id)} — ${fmtSoles(order.total)}\n\n` +
    `Gracias *${order.customerName}* 🌟\n` +
    `¿Cómo estuvo tu compra? Tu reseña ayuda a otros vecinos:\n` +
    `${reviewLink}`;

  await Promise.all([
    sendWaSafe(order.customerPhone, wa, ctx),
    sendPushSafe(
      order.customerPhone,
      {
        title: "✅ ¡Pedido entregado!",
        body: `Pedido #${shortId(order.id)} — ¿Cómo estuvo? Déjanos tu reseña 🌟`,
        url: reviewLink,
      },
      ctx,
    ),
  ]);
}
