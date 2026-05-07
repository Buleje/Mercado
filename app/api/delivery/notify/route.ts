import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppNotification } from "@/lib/whatsapp";
import { sendOrderNotification } from "@/lib/mailer";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

const NotifySchema = z.object({
  partnerId: z.string().min(1, "partnerId requerido"),
  orderId:   z.string().min(1, "orderId requerido"),
  message:   z.string().min(1).max(1000).optional(),
});

/**
 * POST /api/delivery/notify
 * Envía notificación al repartidor cuando hay un pedido asignado.
 * Soporta WhatsApp y email según lo configurado en el partner.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = NotifySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { partnerId, orderId, message } = parsed.data;

  // SECURITY 2026-05-05 (pentest delivery H003): scope tenant. Antes admin
  // de A podía dispararle WhatsApp/email a un partner de B (facturable a costa
  // de B). Ahora `findFirst` con tenantId.
  const partner = await prisma.deliveryPartner.findFirst({
    where: { id: partnerId, tenantId: auth.tenantId },
  });
  if (!partner) {
    return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });
  }

  // Buscar la orden para construir el mensaje
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: auth.tenantId },
    include: { items: { select: { name: true, quantity: true, price: true, unit: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }

  // Parsear configuración de notificaciones del partner (guardada en notes como JSON)
  let notifConfig = { notifyWhatsApp: true, notifyEmail: true, notifyUrgent: true };
  if (partner.notes) {
    try {
      const parsed = JSON.parse(partner.notes) as Partial<typeof notifConfig>;
      notifConfig = { ...notifConfig, ...parsed };
    } catch { /* usar defaults */ }
  }

  const channels: string[] = [];

  // TD-018: order.total y items[].price son Decimal → convertir a number
  const orderTotalNum = toNumOrZero(order.total);
  const itemsAsNum = order.items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    price: toNumOrZero(i.price),
    unit: i.unit,
  }));

  // Mensaje personalizado para el repartidor
  const deliveryMsg =
    message ??
    `Nuevo pedido asignado!\nCliente: ${order.customerName}\nDireccion: ${order.customerLocation || "Sin direccion"}\nTotal: S/ ${orderTotalNum.toFixed(2)}\nRecoge en tienda: ${auth.tenantId}`;

  // Canal WhatsApp (fire-and-forget)
  if (notifConfig.notifyWhatsApp && partner.phone) {
    sendWhatsAppNotification({
      id: order.id,
      customerName: order.customerName,
      customerPhone: partner.phone,
      total: orderTotalNum,
      status: "en_camino",
      items: itemsAsNum,
    }).catch((err) => logger.error("[delivery/notify] WhatsApp send to partner failed", { error: String(err), partnerId, orderId }));
    channels.push("whatsapp");
  }

  // Canal email (fire-and-forget)
  if (notifConfig.notifyEmail && partner.email) {
    sendOrderNotification({
      id: order.id,
      customerName: `[Repartidor: ${partner.name}] ${order.customerName}`,
      customerPhone: partner.phone || undefined,
      customerLocation: order.customerLocation,
      total: orderTotalNum,
      paymentMethod: order.paymentMethod || undefined,
      items: itemsAsNum,
    }).catch((err) => logger.error("[delivery/notify] email send to partner failed", { error: String(err), partnerId, orderId }));
    channels.push("email");
  }

  logActivity(
    "Notificar",
    "DeliveryPartner",
    `Notificacion enviada al repartidor ${partner.name} — canales: ${channels.join(", ") || "ninguno"}`,
    partner.id,
    auth.username
  ).catch(() => {});

  return NextResponse.json({
    notified: channels.length > 0,
    channels,
    partner: { id: partner.id, name: partner.name },
    message: deliveryMsg,
  });
}
