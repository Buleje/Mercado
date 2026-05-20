import { NextRequest, NextResponse } from "next/server";
import { CustomersDB } from "@/lib/db/customers.db";
import { normalizePhone } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";
import { CUSTOMER_SESSION, getCustomerPayload } from "@/lib/auth/customer-session";
import { tryAdmin } from "@/lib/require-admin";
import { runWithAuditContext } from "@/lib/audit/audit-context";

/**
 * SECURITY/CRITICAL 2026-05-06 (pentest H001): autorización obligatoria.
 * Antes este endpoint era totalmente público — cualquiera con un phone
 * target apagaba notifs de pedidos a víctimas y enumeraba customers.
 *
 * Ahora exige una de:
 *   1. Admin del tenant del customer (puede consultar/editar prefs)
 *   2. Customer-session con phone matching el query
 */
type AuthOk = { ok: true; tenantId: string };
type AuthFail = { ok: false; status: number; error: string };

async function authorizePhoneAccess(
  req: NextRequest,
  phone: string,
): Promise<AuthOk | AuthFail> {
  // 1. Admin — scope al tenant del admin (NUNCA cross-tenant)
  const admin = await tryAdmin(req);
  if (admin) {
    return { ok: true, tenantId: admin.tenantId };
  }
  // 2. Customer-session — scope al tenant del payload
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!sessionToken) return { ok: false, status: 401, error: "unauthorized" };
  const payload = await getCustomerPayload(sessionToken);
  const sessionPhone = (payload?.customerId ?? "").replace(/\D/g, "");
  const queryPhone = phone.replace(/\D/g, "");
  if (!sessionPhone || sessionPhone !== queryPhone) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  if (!payload?.tenantId) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, tenantId: payload.tenantId };
}

// GET /api/customer-preferences?phone=XXX
export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "cust-prefs");
  if (rl) return rl;

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") ?? "");
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const auth = await authorizePhoneAccess(req, phone);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // CRITICAL FIX 2026-05-11 (audit P0-1): Customer.phone es @unique GLOBAL.
  // El guard tenantId + phone vive dentro de CustomersDB.getPreferences.
  // Audit project-wide 2026-05-19: migrado.
  const customer = await CustomersDB.getPreferences(auth.tenantId, phone);
  if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(customer);
}

// PATCH /api/customer-preferences body: { phone, notifOrderUpdates?, notifPromotions?, notifRestock? }
export async function PATCH(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "cust-prefs");
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const phone = normalizePhone(String(body.phone ?? ""));
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const auth = await authorizePhoneAccess(req, phone);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const data: Record<string, boolean> = {};
  if (typeof body.notifOrderUpdates === "boolean") data.notifOrderUpdates = body.notifOrderUpdates;
  if (typeof body.notifPromotions === "boolean") data.notifPromotions = body.notifPromotions;
  if (typeof body.notifRestock === "boolean") data.notifRestock = body.notifRestock;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  // Round 15 M004: audit log de Customer prefs update con phone como actor.
  return runWithAuditContext(req, phone, async () => {
    // CRITICAL FIX 2026-05-11 (audit P0-1): el doble-filtro phone+tenantId
    // vive dentro de CustomersDB.updatePreferences.
    // Audit project-wide 2026-05-19: migrado.
    const updated = await CustomersDB.updatePreferences(auth.tenantId, phone, data);
    if (!updated) {
      return NextResponse.json({ error: "customer not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  });
}
