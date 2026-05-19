import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { CustomerOrdersDB } from "@/lib/db/customer-orders.db";
import { MarketplaceAdminDB } from "@/lib/db/marketplace-public.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";

const QuerySchema = z.object({
  phone: z.string().min(6).max(20),
  // P1-1 multi-tenant: tenantId requerido sin default — cliente debe pasarlo
  // explícito; antes "main" recibía pedidos de cualquier tenant si se omitía.
  tenantId: z.string().min(1),
});

/**
 * GET /api/marketplace/mi-cuenta/pedidos?phone=xxx&tenantId=main
 *
 * SECURITY 2026-05-06 (audit team H001): exige customer-session cookie
 * con phone match. Antes era endpoint público — cualquiera con phone+
 * tenantId leía historial de pedidos del cliente (PII Ley 29733 PE).
 */
export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "mi-cuenta-pedidos");
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
        { orders: [], error: "Parametros invalidos" },
        { status: 400 },
      );
    }

    const { phone, tenantId } = parsed.data;

    // Auth gate: exigir customer-session cookie y validar phone match.
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
    if (!session || session.customerId !== phone || session.tenantId !== tenantId) {
      return NextResponse.json(
        { orders: [], error: "No autorizado" },
        { status: 401 },
      );
    }
    const orders = await CustomerOrdersDB.listByCustomer(tenantId, phone);

    // MK-28: derivar storeSlug del tenant
    const storeSlugResult = await MarketplaceAdminDB.getStoreSlugByTenantId(tenantId)
      .catch((e: unknown) => {
        logger.warn("[mi-cuenta/pedidos] store slug lookup failed", { err: e instanceof Error ? e.message : String(e) });
        return null;
      });
    const storeSlug = storeSlugResult ?? tenantId;

    const result = orders.map((o) => ({
      id: o.id,
      total: o.total,
      status: o.status,
      itemsCount: o.items.length,
      storeSlug,
      items: o.items.map((i) => ({
        productId: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        unit: i.unit,
        image: i.image,
      })),
      createdAt: o.createdAt,
    }));

    return NextResponse.json({ orders: result });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
