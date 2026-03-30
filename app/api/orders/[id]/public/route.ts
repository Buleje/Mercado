export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { OrdersDB } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/orders/[id]/public
 * Public endpoint — no auth required.
 * Returns only safe, customer-facing fields (no phone, address, or reference).
 * Rate-limited: MODERATE preset (20 req / 5 min per IP).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = applyRateLimit(req, "MODERATE", "public-order");
  if (limited) return limited;

  const { id } = await params;
  try {
    const order = await OrdersDB.getById(id);
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      id: order.id,
      status: order.status,
      customerName: order.customer.name.split(" ")[0],
      items: order.items.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      total: order.total,
      paymentMethod: order.paymentMethod ?? null,
      notes: order.notes ?? null,
      deliverySlot: order.deliverySlot ?? null,
      couponDiscount: order.couponDiscount ?? null,
      discountAmount: order.discountAmount ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  } catch (e) {
    console.error("[orders/id/public] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
