import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ReorderSchema } from "@/lib/validators/reorder";
import { requireCustomer } from "@/lib/auth/require-customer";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/orders/reorder
 *
 * "Comprar de nuevo" — clona un pedido del historial con ajustes opcionales.
 *
 * ⚠️  Stub documentado. NO escribe en `orders` real.
 * Para producción:
 *   - Leer el order original via `OrderDB.findById(tenantId, id)` (validar
 *     que el customer es el owner)
 *   - Clonar items, restar stock, idempotency via original+timestamp
 *   - Cobrar con el mismo payment method si aplica
 *
 * Auth: customer session required.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "orders-reorder"); if (_rl) return _rl;
  const customerOrResp = await requireCustomer(req);
  if (customerOrResp instanceof NextResponse) return customerOrResp;
  const customer = customerOrResp;

  const body = await req.json().catch(() => ({}));
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const newOrderId = `ro_${customer.tenantId.slice(0, 6)}_${randomUUID().slice(0, 12)}`;
  const etaIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const subtotal = parsed.data.items.reduce(
    (sum, it) => sum + it.unitPrice * it.quantity,
    0,
  );
  const deliveryFee = 3.5;
  const total = subtotal + deliveryFee;

  return NextResponse.json({
    ok: true,
    order: {
      id: newOrderId,
      status: "stub_reordered",
      originalOrderId: parsed.data.originalOrderId,
      subtotal,
      deliveryFee,
      total,
      estimatedEta: etaIso,
    },
  });
}
