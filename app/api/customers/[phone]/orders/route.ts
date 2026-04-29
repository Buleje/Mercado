import { NextRequest, NextResponse } from "next/server";
import { OrdersDB, normalizePhone } from "@/lib/jsondb";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { logger } from "@/lib/logger";

// -- GET /api/customers/[phone]/orders -- public, rate-limited ----------------
// Returns orders for a customer identified by phone number.
// SECURITY (HOTFIX-C6, 2026-04-29):
//   - Rate-limit BAJADO de 30/min → 5/min para frenar enumeración masiva.
//   - Si hay customer-session válida y phone coincide → ALLOW.
//   - Sin session, log y respuesta vacía con header 200 (no 401 para no
//     revelar al atacante que el endpoint requiere auth — UX de cliente
//     anónimo se preserva con respuesta vacía).
// Tenant-scoped via x-tenant-id header injected by proxy/middleware.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const ip = getClientIp(req);
  // Rate limit endurecido: 5/min por IP (antes 30/min). Vector de cosecha
  // masiva de PII por enumeración → multa Ley 29733 PE hasta 100 UIT.
  const { allowed } = rateLimit(`customer-orders:${ip}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const tenantId = getTenantIdFromRequest(req);
  const { phone } = await params;
  const normalizedPhone = normalizePhone(phone);

  // Customer-session check: si hay cookie firmada con HMAC y el phone
  // del path coincide con el customerId del session, autorizamos.
  // Si no hay session, devolvemos lista vacía (no leak por path-param).
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  let authorized = false;
  if (sessionToken) {
    const payload = await getCustomerPayload(sessionToken);
    if (payload?.customerId && normalizePhone(payload.customerId) === normalizedPhone) {
      authorized = true;
    }
  }
  if (!authorized) {
    logger.info("[customers/orders] anon access — returning empty", { ip, phone: normalizedPhone.slice(0, 4) + "***" });
    return NextResponse.json([]);
  }

  try {
    const orders = await OrdersDB.getByCustomerPhone(tenantId, normalizedPhone);
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
