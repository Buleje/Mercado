import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { OrdersDB } from "@/lib/db/orders.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";

const BodySchema = z.object({
  phone: z.string().min(6).max(20),
});

/**
 * POST /api/marketplace/reorder/last
 *
 * SECURITY 2026-05-06 (audit team H002): exige customer-session match
 * + scope tenantId. Antes `OrdersDB.getLastByCustomer(phone)` no recibía
 * tenantId — cualquiera con phone target leía último pedido cross-tenant.
 *
 * Body: { phone: string }
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

    // Auth gate: exigir customer-session cookie con phone match.
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
    if (!session || session.customerId !== phone) {
      return NextResponse.json(
        { items: [], message: "No autorizado" },
        { status: 401 },
      );
    }

    // audit P0 Cal #2: firma cambiada a (tenantId, phone) — required.
    const result = await OrdersDB.getLastByCustomer(session.tenantId, phone);

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
