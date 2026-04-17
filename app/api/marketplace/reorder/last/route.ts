import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { OrdersDB } from "@/lib/db/orders.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  phone: z.string().min(6).max(20),
});

/**
 * POST /api/marketplace/reorder/last
 *
 * Endpoint público (autenticación débil por teléfono, igual que cart/restore).
 * Devuelve los items del último pedido marketplace del cliente para pre-llenar
 * el carrito. No crea ni modifica pedidos — solo lectura.
 *
 * Body: { phone: string }
 * Response: { items: ReorderItem[], message?: string }
 */
export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "marketplace-reorder-last");
  if (limited) return limited;

  const traceId = newTraceId();

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { items: [], message: "Número de teléfono inválido" },
        { status: 400 },
      );
    }

    const { phone } = parsed.data;

    const result = await OrdersDB.getLastByCustomer(phone);

    if (!result || result.items.length === 0) {
      return NextResponse.json({
        items: [],
        message: "Aún no has hecho pedidos",
      });
    }

    return NextResponse.json({ items: result.items });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
