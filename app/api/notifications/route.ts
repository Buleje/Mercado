import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotificationLogsDB, OrdersDB, SettingsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

// SECURITY 2026-05-06 (audit notifs #4): Zod schema en lugar de validación
// manual. Antes `body.message` arbitrario se persistía en NotificationLog.
const NotifPostSchema = z.object({
  phone: z.string().min(8).max(20),
  orderId: z.string().min(3).max(80),
  type: z.string().max(60).optional(),
  message: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  // SECURITY 2026-05-06 (audit notifs #6): rol explícito + paginación.
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await NotificationLogsDB.getAll(auth.tenantId));
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "notifications"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = NotifPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const body = parsed.data;

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
