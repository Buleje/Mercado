/**
 * notify-driver.ts
 * Lógica interna de notificación a repartidor, extraída de
 * app/api/delivery/notify/route.ts para evitar SSRF por cookie forwarding.
 *
 * Cualquier route handler que necesite notificar a un partner debe llamar
 * a notifyDriverInternal() directamente — sin pasar por HTTP.
 */
import { prisma } from "@/lib/prisma";
import { sendWhatsAppNotification } from "@/lib/whatsapp";
import { sendOrderNotification } from "@/lib/mailer";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

export interface NotifyDriverParams {
  tenantId: string;
  partnerId: string;
  orderId: string;
  /** Mensaje custom para el repartidor. Si se omite se genera uno por defecto. */
  message?: string;
}

export interface NotifyDriverResult {
  ok: boolean;
  notified: boolean;
  channels: string[];
  /** Mensaje final enviado al repartidor (útil para logging en el caller). */
  message?: string;
}

/**
 * Notifica al repartidor vía WhatsApp y/o email según su configuración.
 * No requiere auth HTTP — el caller es responsable de validar permisos.
 * No lanza excepciones: errores de canal se loguean y se continúa.
 */
export async function notifyDriverInternal(
  params: NotifyDriverParams,
): Promise<NotifyDriverResult> {
  const { tenantId, partnerId, orderId, message } = params;

  const partner = await prisma.deliveryPartner.findFirst({
    where: { id: partnerId, tenantId },
  });
  if (!partner) {
    logger.warn("[notify-driver] partner not found", { partnerId, tenantId });
    return { ok: false, notified: false, channels: [] };
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { items: { select: { name: true, quantity: true, price: true, unit: true } } },
  });
  if (!order) {
    logger.warn("[notify-driver] order not found", { orderId, tenantId });
    return { ok: false, notified: false, channels: [] };
  }

  let notifConfig = { notifyWhatsApp: true, notifyEmail: true, notifyUrgent: true };
  if (partner.notes) {
    try {
      const parsedNotes = JSON.parse(partner.notes) as Partial<typeof notifConfig>;
      notifConfig = { ...notifConfig, ...parsedNotes };
    } catch { /* usar defaults */ }
  }

  const orderTotalNum = toNumOrZero(order.total);
  const itemsAsNum = order.items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    price: toNumOrZero(i.price),
    unit: i.unit,
  }));

  const deliveryMsg =
    message ??
    `Nuevo pedido asignado!\nCliente: ${order.customerName}\nDireccion: ${order.customerLocation || "Sin direccion"}\nTotal: S/ ${orderTotalNum.toFixed(2)}\nRecoge en tienda: ${tenantId}`;

  const channels: string[] = [];

  if (notifConfig.notifyWhatsApp && partner.phone) {
    sendWhatsAppNotification({
      id: order.id,
      customerName: order.customerName,
      customerPhone: partner.phone,
      total: orderTotalNum,
      status: "en_camino",
      items: itemsAsNum,
    }).catch((err) =>
      logger.error("[notify-driver] WhatsApp failed", { error: String(err), partnerId, orderId }),
    );
    channels.push("whatsapp");
  }

  if (notifConfig.notifyEmail && partner.email) {
    sendOrderNotification({
      id: order.id,
      customerName: `[Repartidor: ${partner.name}] ${order.customerName}`,
      customerPhone: partner.phone || undefined,
      customerLocation: order.customerLocation,
      total: orderTotalNum,
      paymentMethod: order.paymentMethod || undefined,
      items: itemsAsNum,
    }).catch((err) =>
      logger.error("[notify-driver] email failed", { error: String(err), partnerId, orderId }),
    );
    channels.push("email");
  }

  return { ok: true, notified: channels.length > 0, channels, message: deliveryMsg };
}
