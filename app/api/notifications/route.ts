export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { NotificationLogsDB, OrdersDB, SettingsDB } from "@/lib/jsondb";

export async function GET() {
  return NextResponse.json(await NotificationLogsDB.getAll());
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.phone || !body.orderId) {
    return NextResponse.json({ error: "phone and orderId required" }, { status: 400 });
  }

  const order = await OrdersDB.getById(body.orderId);
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const settings = await SettingsDB.get();
  const storeName = settings?.businessName ?? "Bodega San MartÃ­n";

  const STATUS_MSGS: Record<string, string> = {
    pendiente: `ðŸ›’ Â¡Hola! Tu pedido #${order.id.slice(-6)} en ${storeName} ha sido recibido. Te confirmaremos pronto. Total: S/${order.total.toFixed(2)}`,
    confirmado: `âœ… Â¡Tu pedido #${order.id.slice(-6)} ha sido confirmado! Estamos preparÃ¡ndolo. Total: S/${order.total.toFixed(2)}`,
    en_camino: `ðŸšš Â¡Tu pedido #${order.id.slice(-6)} va en camino! Pronto llegarÃ¡ a tu direcciÃ³n.`,
    entregado: `ðŸ“¦ Â¡Pedido #${order.id.slice(-6)} entregado! Gracias por tu compra en ${storeName}. Â¡Vuelve pronto!`,
    cancelado: `âŒ Tu pedido #${order.id.slice(-6)} ha sido cancelado. Para mÃ¡s info contacta al ${settings?.businessPhone ?? "tienda"}.`,
  };

  const type = body.type ?? `order_${order.status}`;
  const message = body.message ?? STATUS_MSGS[order.status] ?? `ActualizaciÃ³n de tu pedido #${order.id.slice(-6)}`;
  const phone = body.phone.replace(/[^0-9]/g, "");
  const whatsappUrl = `https://wa.me/${phone.startsWith("51") ? phone : "51" + phone}?text=${encodeURIComponent(message)}`;

  const log = await NotificationLogsDB.add({
    type,
    recipient: phone,
    message,
    status: "sent",
    orderId: order.id,
  });

  return NextResponse.json({ ...log, whatsappUrl }, { status: 201 });
}
