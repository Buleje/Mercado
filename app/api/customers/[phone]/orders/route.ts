import { NextRequest, NextResponse } from "next/server";
import { OrdersDB, normalizePhone } from "@/lib/jsondb";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// -- GET /api/customers/[phone]/orders -- public, rate-limited ----------------
// Returns orders for a customer identified by phone number.
// No admin auth -- customers look up their own orders from /cuenta.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`customer-orders:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { phone } = await params;
  try {
    const orders = await OrdersDB.getByCustomerPhone(normalizePhone(phone));
    // Return safe customer-facing fields only (no internal admin notes or full details)
    const safe = orders.map((o) => ({
      id: o.id,
      status: o.status,
      total: o.total,
      paymentMethod: o.paymentMethod,
      items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, price: i.price, image: i.image })),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));
    return NextResponse.json(safe);
  } catch (e) {
    console.error("[customers/orders] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
