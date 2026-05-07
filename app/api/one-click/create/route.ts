import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { OneClickOrderSchema } from "@/lib/validators/one-click";
import { createOneClickOrder } from "@/lib/db/one-click-orders.db";
import { requireCustomer } from "@/lib/auth/require-customer";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/one-click/create
 *
 * Amazon-style 1-Click Buy — crea un pedido stub sin carrito.
 *
 * ⚠️  Este endpoint NO escribe en `orders` real. Es un stub demo.
 * Ver `lib/db/one-click-orders.db.ts` para el TODO de integración real.
 *
 * Auth: customer session required (via requireCustomer).
 * Validación: OneClickOrderSchema (Zod safeParse).
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "one-click-create"); if (_rl) return _rl;
  const customerOrResp = await requireCustomer(req);
  if (customerOrResp instanceof NextResponse) return customerOrResp;
  const customer = customerOrResp;

  const body = await req.json().catch(() => ({}));
  const parsed = OneClickOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const userId = customer.customerId ?? customer.email;
    const order = await createOneClickOrder(
      parsed.data,
      userId,
      customer.tenantId,
    );
    return NextResponse.json({ ok: true, order });
  } catch {
    return NextResponse.json(
      { error: "No pudimos procesar tu compra. Intentá de nuevo." },
      { status: 500 },
    );
  }
}
