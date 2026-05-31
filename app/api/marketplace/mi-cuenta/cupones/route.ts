import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { CustomerCouponsDB } from "@/lib/db/customer-coupons.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";

const QuerySchema = z.object({
  phone: z.string().min(6).max(20),
  // tenantId requerido sin default (aislamiento multi-tenant, P1-1).
  tenantId: z.string().min(1),
});

/**
 * GET /api/marketplace/mi-cuenta/cupones?phone=xxx&tenantId=main
 *
 * Espeja la seguridad de /pedidos: exige customer-session cookie con phone
 * match (PII Ley 29733 PE). CustomerCouponsDB es stub hasta PR-2 (ADR-059) —
 * retorna [] hoy; la ruta existe para que el cliente no reciba 404.
 */
export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "mi-cuenta-cupones");
  if (limited) return limited;

  const traceId = newTraceId();

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      phone: searchParams.get("phone") ?? "",
      tenantId: searchParams.get("tenantId") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { coupons: [], error: "Parametros invalidos" },
        { status: 400 },
      );
    }

    const { phone, tenantId } = parsed.data;

    // Auth gate: exigir customer-session cookie y validar phone match.
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
    if (!session || session.customerId !== phone || session.tenantId !== tenantId) {
      return NextResponse.json(
        { coupons: [], error: "No autorizado" },
        { status: 401 },
      );
    }

    const coupons = await CustomerCouponsDB.listByCustomer(tenantId, phone);
    return NextResponse.json({ coupons });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
