import { NextRequest, NextResponse } from "next/server";
import { OrdersDB, InventoryMovementsDB, LoyaltyDB } from "@/lib/jsondb";
import type { DbOrder } from "@/lib/jsondb";
import { sendWhatsAppNotification, getWhatsAppLink } from "@/lib/whatsapp";
import { logActivity } from "@/lib/activity-logger";
import { sendPushToPhone } from "@/lib/push-sender";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const order = await OrdersDB.getById(id);
    if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    console.error("[orders/id] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const body = await req.json() as Partial<DbOrder>;

    // Check current status before update
    const current = await OrdersDB.getById(id);

    const updated = await OrdersDB.update(id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Decrement stock when order is delivered (fire-and-forget)
    if (body.status === "entregado" && current && current.status !== "entregado") {
      for (const item of updated.items) {
        InventoryMovementsDB.record({
          productId: item.id,
          type: "venta_online",
          quantity: item.quantity,
          reference: updated.id,
          notes: `Pedido online entregado: ${item.name}`,
        }).catch(() => {});
      }
      // Accrue loyalty points
      if (updated.customer.phone) {
        LoyaltyDB.accruePoints(updated.customer.phone, updated.total).catch(() => {});
      }
    }

    // WhatsApp notification on status change (fire-and-forget auto-send, always include link)
    let whatsappLink: string | null = null;
    if (body.status && body.status !== current?.status && updated.customer.phone) {
      const orderInfo = {
        id: updated.id,
        customerName: updated.customer.name,
        customerPhone: updated.customer.phone,
        total: updated.total,
        status: updated.status,
        paymentMethod: updated.paymentMethod,
        deliverySlot: (updated as Record<string, unknown>).deliverySlot as string | undefined,
        items: updated.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, unit: i.unit })),
      };
      whatsappLink = getWhatsAppLink(orderInfo);
      // Try auto-send via API (silent fail if not configured)
      sendWhatsAppNotification(orderInfo).catch(() => {});
      // Push notification to customer's device (fire-and-forget)
      const STATUS_LABELS: Record<string, string> = {
        confirmado: "✅ Pedido confirmado",
        en_camino: "🛵 Tu pedido está en camino",
        entregado: "🎉 Pedido entregado",
        cancelado: "❌ Pedido cancelado",
      };
      const pushTitle = STATUS_LABELS[updated.status] ?? "Actualización de pedido";
      sendPushToPhone(updated.customer.phone, {
        title: pushTitle,
        body: `Pedido #${updated.id.slice(-6)} — S/${updated.total.toFixed(2)}`,
        url: `/pedido/${updated.id}`,
      }).catch(() => {});
    }

    if (body.status) {
      logActivity("Estado", "pedido", `Pedido ${id.slice(0, 8)} cambiado a ${body.status}`, id).catch(() => {});
    }

    return NextResponse.json({ ...updated, whatsappLink });
  } catch (e) {
    console.error("[orders/id] PATCH error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    await OrdersDB.delete(id);
    logActivity("Eliminar", "pedido", `Pedido #${id.slice(0, 8)} eliminado`, id).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[orders/id] DELETE error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
