/**
 * lib/whatsapp-order-notify.ts
 *
 * Notificación de WhatsApp automática al DUEÑO de la tienda cuando se
 * crea una nueva orden en el marketplace.
 *
 * Uso:
 *   notifyOwnerNewOrder(order, tenant).catch((err) => logger.error(...));
 *
 * El envío es siempre fire-and-forget — nunca debe bloquear la creación
 * de la orden ni lanzar al caller.
 */

import "server-only";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import type { DbOrder } from "@/lib/db/misc.db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  ownerPhone?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (base) return base;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Render la plantilla del mensaje al dueño.
 * Sigue el formato acordado por el proyecto (Pucallpa, Perú).
 */
function buildOwnerMessage(order: DbOrder, tenant: TenantInfo): string {
  const adminUrl = `${getBaseUrl()}/admin/pedidos`;

  const itemLines = order.items
    .map(
      (i) =>
        `  • ${i.name} x${i.quantity} — S/${(i.price * i.quantity).toFixed(2)}`
    )
    .join("\n");

  const customerPhone = order.customer.phone
    ? `\n📞 Tel: ${order.customer.phone}`
    : "";

  const deliveryLine = order.customer.location
    ? `\n📍 Entrega: ${order.customer.location}`
    : "";

  return (
    `🛒 *Nueva venta en ${tenant.name}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Cliente: ${order.customer.name}` +
    customerPhone +
    deliveryLine +
    `\n\n📦 *Productos:*\n${itemLines}\n\n` +
    `💰 *Total: S/${order.total.toFixed(2)}*\n\n` +
    `🔗 Ver pedido:\n${adminUrl}`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Envía un WhatsApp al dueño de la tienda informando la nueva orden.
 *
 * Retorna `true` si el mensaje fue enviado, `false` si el feature flag
 * está deshabilitado, si el tenant no tiene ownerPhone configurado,
 * o si la API de WhatsApp no está configurada.
 *
 * NUNCA lanza — los errores se loguean y se tragan para no romper la
 * creación de la orden.
 */
export async function notifyOwnerNewOrder(
  order: DbOrder,
  tenant: TenantInfo
): Promise<boolean> {
  // 1. Feature flag guard
  if (!isFeatureEnabled("whatsapp-order-notifications", tenant.id)) {
    return false;
  }

  // 2. El tenant necesita un número de teléfono registrado
  if (!tenant.ownerPhone) {
    logger.warn("[whatsapp-order-notify] Tenant sin ownerPhone", {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    });
    return false;
  }

  const message = buildOwnerMessage(order, tenant);

  try {
    const sent = await sendWhatsAppText(tenant.ownerPhone, message);
    if (sent) {
      logger.info("[whatsapp-order-notify] Notificación enviada al dueño", {
        tenantId: tenant.id,
        orderId: order.id,
        ownerPhone: tenant.ownerPhone,
      });
    }
    return sent;
  } catch (err) {
    logger.error("[whatsapp-order-notify] Error al enviar WhatsApp al dueño", {
      tenantId: tenant.id,
      orderId: order.id,
      error: String(err),
    });
    return false;
  }
}
