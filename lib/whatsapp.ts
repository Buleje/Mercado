import "server-only";

import { logger } from "@/lib/logger";
import { getBreaker } from "@/lib/circuit-breaker/registry";
import { CircuitOpenError } from "@/lib/circuit-breaker/breaker";

// Circuit breaker para WhatsApp — si el upstream falla repetido, abrimos el
// circuito y evitamos llamadas inútiles por 30s. Protege la UX del checkout
// cuando Meta API está caída.
const whatsappBreaker = getBreaker("whatsapp", {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxCalls: 2,
  timeoutMs: 8_000,
});

/**
 * WhatsApp notification templates for order status changes.
 */

type OrderItem = { name: string; quantity: number; price?: number; unit?: string };

type OrderInfo = {
  id: string;
  customerName: string;
  customerPhone: string;
  total: number;
  status: string;
  paymentMethod?: string;
  deliverySlot?: string;
  items?: OrderItem[];
};

/** 8-char short order ID for display */
function shortId(id: string) { return id.slice(-8).toUpperCase(); }

/** Render an itemized receipt block */
function renderItems(items: OrderItem[]): string {
  if (!items.length) return "";
  const lines = items.map(i => {
    const price = i.price != null ? ` — S/${(i.price * i.quantity).toFixed(2)}` : "";
    return `  • ${i.quantity}${i.unit ? ` ${i.unit}` : "x"} *${i.name}*${price}`;
  });
  return lines.join("\n");
}

const PAYMENT_LABELS: Record<string, string> = { efectivo: "Efectivo 💵", yape: "Yape 📱", plin: "Plin 📲", tarjeta: "Tarjeta 💳" };

const TEMPLATES: Record<string, (o: OrderInfo) => string> = {
  pendiente: (o) => {
    const items = o.items?.length ? `\n\n*Tu pedido:*\n${renderItems(o.items)}\n\n` : "\n\n";
    const pay = o.paymentMethod ? `💳 Pago: ${PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod}\n` : "";
    return (
      `🏪 *Buleje*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *PEDIDO RECIBIDO*\n` +
      `Pedido #${shortId(o.id)}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Hola *${o.customerName}* 👋 ¡Recibimos tu pedido!` +
      items +
      `💰 *Total: S/${o.total.toFixed(2)}*\n` +
      pay +
      `⏳ Estamos procesando tu pedido. Te avisamos cuando sea confirmado.\n\n` +
      `📍 Seguimiento en tiempo real:\n${getTrackingUrl(o.id)}\n\n` +
      `_Gracias por comprar en Buleje_ 🙏`
    );
  },

  confirmado: (o) => {
    const items = o.items?.length ? `\n\n*Tu pedido:*\n${renderItems(o.items)}\n\n` : "\n\n";
    const pay = o.paymentMethod ? `💳 Pago: ${PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod}\n` : "";
    const slot = o.deliverySlot && o.deliverySlot !== "lo-antes-posible" ? `🕐 Entrega: ${o.deliverySlot}\n` : "🕐 Entrega: Lo antes posible\n";
    return (
      `🏪 *Buleje*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `✅ *PEDIDO CONFIRMADO*\n` +
      `Pedido #${shortId(o.id)}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Hola *${o.customerName}* 👋 ¡Recibimos tu pedido!` +
      items +
      `💰 *Total: S/${o.total.toFixed(2)}*\n` +
      pay +
      slot +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📍 Seguimiento en tiempo real:\n${getTrackingUrl(o.id)}\n\n` +
      `_Gracias por confiar en nosotros_ 🙏`
    );
  },

  en_camino: (o) =>
    `🏪 *Buleje*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🛵 *¡TU PEDIDO VA EN CAMINO!*\n` +
    `Pedido #${shortId(o.id)}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Hola *${o.customerName}*, estate atento 🚗💨\n\n` +
    `💰 Total: S/${o.total.toFixed(2)}\n\n` +
    `📍 Sigue tu pedido en vivo:\n${getTrackingUrl(o.id)}\n\n` +
    `_Llegamos pronto, ¡gracias por esperar!_`,

  entregado: (o) =>
    `🏪 *Buleje*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🎉 *PEDIDO ENTREGADO*\n` +
    `Pedido #${shortId(o.id)}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `¡Hola *${o.customerName}*! Tu pedido llegó 😊\n\n` +
    `💰 Total pagado: S/${o.total.toFixed(2)}\n\n` +
    `⭐ ¿Todo estuvo bien? Déjanos una reseña:\n${getAccountUrl()}\n\n` +
    `_¡Hasta la próxima compra!_ 🛒`,

  cancelado: (o) =>
    `🏪 *Buleje*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `❌ Pedido *cancelado*\n` +
    `Pedido #${shortId(o.id)}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Hola *${o.customerName}*, lamentamos informarte que tu pedido fue cancelado.\n\n` +
    `Si tienes preguntas, escríbenos al: wa.me/51929340532\n\n` +
    `_— Buleje_`,
};

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
}

function getTrackingUrl(orderId: string): string {
  return `${getBaseUrl()}/pedido/${orderId}`;
}

function getAccountUrl(): string {
  return `${getBaseUrl()}/cuenta`;
}

/** Format a phone for wa.me (expects digits, adds 51 prefix if 9 digits) */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) return `51${digits}`;
  return digits;
}

/** Generate a wa.me link with pre-filled message */
export function getWhatsAppLink(order: OrderInfo): string | null {
  const template = TEMPLATES[order.status];
  if (!template || !order.customerPhone) return null;
  const message = template(order);
  const phone = formatPhone(order.customerPhone);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Get the raw message text */
export function getWhatsAppMessage(order: OrderInfo): string | null {
  const template = TEMPLATES[order.status];
  if (!template) return null;
  return template(order);
}

/**
 * Send a WhatsApp message via API (if configured).
 * Returns true if sent, false if no API configured, throws on error.
 */
export async function sendWhatsAppNotification(order: OrderInfo): Promise<boolean> {
  const message = getWhatsAppMessage(order);
  if (!message || !order.customerPhone) return false;
  return sendWhatsAppText(order.customerPhone, message);
}

/**
 * Send a generic WhatsApp text message to any phone number.
 * Returns true if sent, false if no API configured, throws on error.
 */
export async function sendWhatsAppText(phone: string, message: string): Promise<boolean> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  if (!apiUrl || !apiToken || !phone) return false;

  const formatted = formatPhone(phone);
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: formatted,
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API error: ${res.status} ${text}`);
  }

  return true;
}

/**
 * Send WhatsApp notification with automatic retries (3 attempts, exponential backoff).
 * Fire-and-forget safe: logs failures instead of throwing.
 */
export async function sendWhatsAppNotificationWithRetry(
  order: Parameters<typeof sendWhatsAppNotification>[0],
  maxRetries = 3,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendWhatsAppNotification(order);
    } catch (err) {
      logger.warn("[whatsapp] Notification attempt failed", {
        orderId: order.id,
        attempt,
        maxRetries,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  logger.error("[whatsapp] All notification retries exhausted", { orderId: order.id });
  return false;
}

/**
 * Send WhatsApp text with automatic retries (3 attempts, exponential backoff).
 * Fire-and-forget safe: logs failures instead of throwing.
 */
export async function sendWhatsAppTextWithRetry(
  phone: string,
  message: string,
  maxRetries = 3,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendWhatsAppText(phone, message);
    } catch (err) {
      logger.warn("[whatsapp] Text send attempt failed", {
        phone,
        attempt,
        maxRetries,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  logger.error("[whatsapp] All text send retries exhausted", { phone });
  return false;
}

/**
 * Queue-backed WhatsApp send (preferred for fire-and-forget).
 *
 * - When the BullMQ queue is enabled (REDIS_URL set), enqueues a notification
 *   job so delivery is durable + retryable + observable.
 * - When disabled, falls back to the in-process `sendWhatsAppTextWithRetry`.
 *
 * Use this instead of calling `sendWhatsAppText(...).catch(() => {})` from
 * route handlers — the queue retries transparently and notifications survive
 * server restarts.
 */
export async function sendWhatsAppQueued(
  phone: string,
  message: string,
  meta: { tenantId: string; context?: string; metadata?: Record<string, unknown> },
): Promise<{ queued: boolean; jobId?: string }> {
  try {
    const { isQueueEnabled, enqueueNotification } = await import("@/lib/queue");
    if (isQueueEnabled()) {
      const jobId = await enqueueNotification({
        type: "whatsapp",
        recipient: phone,
        message,
        tenantId: meta.tenantId,
        metadata: { context: meta.context, ...(meta.metadata ?? {}) },
      });
      return { queued: true, jobId: jobId ?? undefined };
    }
  } catch (err) {
    logger.warn("[whatsapp] Queue enqueue failed — falling back to direct send", {
      error: err instanceof Error ? err.message : String(err),
      context: meta.context,
    });
  }
  // Fallback — direct send con circuit breaker protegiendo WhatsApp upstream.
  try {
    const ok = await whatsappBreaker.exec(() => sendWhatsAppTextWithRetry(phone, message));
    return { queued: false, jobId: ok ? "direct" : undefined };
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("[whatsapp] circuit open — skipping send", { tenantId: meta.tenantId, context: meta.context });
      return { queued: false, jobId: undefined };
    }
    throw err;
  }
}
