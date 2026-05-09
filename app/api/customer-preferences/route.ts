import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
async function authorizePhoneAccess(
  req: NextRequest,
  phone: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  // 1. Admin
  const admin = await tryAdmin(req);
  if (admin) {
    return { ok: true };
  }
  // 2. Customer-session
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!sessionToken) return { ok: false, status: 401, error: "unauthorized" };
  const payload = await getCustomerPayload(sessionToken);
  const sessionPhone = (payload?.customerId ?? "").replace(/\D/g, "");
  const queryPhone = phone.replace(/\D/g, "");
  if (!sessionPhone || sessionPhone !== queryPhone) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}

// GET /api/customer-preferences?phone=XXX
export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "cust-prefs");
  if (rl) return rl;

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") ?? "");
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const auth = await authorizePhoneAccess(req, phone);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: { notifOrderUpdates: true, notifPromotions: true, notifRestock: true },
  });

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
    try {
      const updated = await prisma.customer.update({
        where: { phone },
        data,
        select: { notifOrderUpdates: true, notifPromotions: true, notifRestock: true },
      });
      return NextResponse.json(updated);
    } catch {
      return NextResponse.json({ error: "customer not found" }, { status: 404 });
    }
  });
}
