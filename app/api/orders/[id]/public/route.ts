import { NextResponse } from "next/server";
import { OrdersDB } from "@/lib/jsondb";

/**
 * Public endpoint — no auth required.
 * Returns only the fields a customer needs to track their order.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const order = await OrdersDB.getById(id);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: order.id,
    status: order.status,
    customerName: order.customer.name,
    items: order.items,
    total: order.total,
    paymentMethod: order.paymentMethod ?? null,
    notes: order.notes ?? null,
    deliverySlot: order.deliverySlot ?? null,
    couponDiscount: order.couponDiscount ?? null,
    discountAmount: order.discountAmount ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
}
