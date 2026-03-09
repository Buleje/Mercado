import { NextResponse } from "next/server";
import { OrdersDB, normalizePhone } from "@/lib/jsondb";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ phone: string }> }
) {
  const { phone } = await ctx.params;
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 6) {
    return NextResponse.json({ error: "invalid phone" }, { status: 400 });
  }
  const orders = await OrdersDB.getByCustomerPhone(normalized);
  // Return only safe public fields (strip customer addresses/references)
  const safe = orders.map((o) => ({
    id: o.id,
    items: o.items.map((i) => ({ productId: i.id, name: i.name, price: i.price, quantity: i.quantity, unit: i.unit, image: i.image })),
    total: o.total,
    status: o.status,
    paymentMethod: o.paymentMethod,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));
  return NextResponse.json(safe);
}
