import { NextRequest, NextResponse } from "next/server";
import { NotificationLogsDB, OrdersDB, SettingsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await NotificationLogsDB.getAll(auth.tenantId));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  if (!body.phone || !body.orderId) {
    return NextResponse.json({ error: "phone and orderId required" }, { status: 400 });
  }

  const order = await OrdersDB.getById(auth.tenantId, body.orderId);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const settings = await SettingsDB.get(auth.tenantId);
  const storeName = settings?.businessName ?? "Buleje";

  const STATUS_MSGS: Record<string, string> = {
    pendiente: `ðŸ›’ ¡Hola! Tu pedido #${order.id.slice(-6)} en ${storeName} ha sido recibido. Te confirmaremos pronto. Total: S/${order.total.toFixed(2)}`,
    confirmado: `âœ… ¡Tu pedido #${order.id.slice(-6)} ha sido confirmado! Estamos preparándolo. Total: S/${order.total.toFixed(2)}`,
    en_camino: `ðŸšš ¡Tu pedido #${order.id.slice(-6)} va en camino! Pronto llegará a tu dirección.`,
    entregado: `ðŸ“¦ ¡Pedido #${order.id.slice(-6)} entregado! Gracias por tu compra en ${storeName}. ¡Vuelve pronto!`,
    cancelado: `âŒ Tu pedido #${order.id.slice(-6)} ha sido cancelado. Para más info contacta al ${settings?.businessPhone ?? "tienda"}.`,
  };

  const type = body.type ?? `order_${order.status}`;
  const message = body.message ?? STATUS_MSGS[order.status] ?? `Actualización de tu pedido #${order.id.slice(-6)}`;
  const phone = body.phone.replace(/[^0-9]/g, "");
  const whatsappUrl = `https://wa.me/${phone.startsWith("51") ? phone : "51" + phone}?text=${encodeURIComponent(message)}`;

  const log = await NotificationLogsDB.add({
    type,
    recipient: phone,
    message,
    status: "sent",
    orderId: order.id,
  }, auth.tenantId);

  return NextResponse.json({ ...log, whatsappUrl }, { status: 201 });
}
