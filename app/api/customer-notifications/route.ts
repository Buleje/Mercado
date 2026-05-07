import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin, tryAdmin } from "@/lib/require-admin";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { CUSTOMER_SESSION, getCustomerPayload } from "@/lib/auth/customer-session";

/**
 * GET  /api/customer-notifications?phone=XXX       — list notifications (latest 50)
 * POST /api/customer-notifications                  — create notification (internal use)
 * PATCH /api/customer-notifications?id=XXX          — mark as read
 * PATCH /api/customer-notifications?phone=XXX&all=1 — mark all as read
 *
 * SECURITY 2026-05-06 (pentest H004): toda lectura/escritura requiere
 * autorización. Antes era abierto: cualquiera podía pedir notifs de cualquier
 * phone. Ahora exige customer-session JWT con phone matching, o admin del
 * tenant.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function authorizeAccess(req: NextRequest, phone: string): Promise<{ tenantId: string } | { error: string; status: number }> {
  // 1. Admin path: si hay sesión admin, valida tenant scope.
  const admin = await tryAdmin(req);
  if (admin) {
    return { tenantId: admin.tenantId };
  }
  // 2. Customer path: requiere JWT customer-session con phone matching.
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!sessionToken) return { error: "unauthorized", status: 401 };
  const payload = await getCustomerPayload(sessionToken);
  if (!payload) return { error: "session_invalid", status: 401 };
  // El customer puede leer SUS propias notificaciones. customerId del JWT
  // es Customer.phone según `lib/auth/customer-session.ts`. Comparamos
  // phones normalizados (sin separadores).
  const sessionPhone = normalizePhone(payload.customerId ?? "");
  const queryPhone = normalizePhone(phone);
  if (!sessionPhone || sessionPhone !== queryPhone) {
    return { error: "forbidden", status: 403 };
  }
  return { tenantId: getTenantIdFromRequest(req) };
}

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "cust-notif");
  if (rl) return rl;

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const auth = await authorizeAccess(req, phone);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { tenantId } = auth;

  const notifications = await prisma.customerNotification.findMany({
    where: { tenantId, customerPhone: phone },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.customerNotification.count({
    where: { tenantId, customerPhone: phone, read: false },
  });

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json() as {
      customerPhone: string;
      type: string;
      title: string;
      body: string;
      link?: string;
    };

    if (!body.customerPhone || !body.title || !body.body) {
      return NextResponse.json({ error: "customerPhone, title, body required" }, { status: 400 });
    }

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { tenantId: auth.tenantId, phone: body.customerPhone },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const notification = await prisma.customerNotification.create({
      data: {
        tenantId: auth.tenantId,
        customerPhone: body.customerPhone,
        type: body.type || "general",
        title: body.title,
        body: body.body,
        link: body.link,
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "cust-notif-read");
  if (rl) return rl;

  const id = req.nextUrl.searchParams.get("id");
  const phone = req.nextUrl.searchParams.get("phone");
  const all = req.nextUrl.searchParams.get("all");

  if (id) {
    // Para mark-by-id necesitamos saber el phone del notification. Lo
    // miramos primero y luego autorizamos.
    const notif = await prisma.customerNotification.findUnique({
      where: { id },
      select: { tenantId: true, customerPhone: true },
    });
    if (!notif) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const auth = await authorizeAccess(req, notif.customerPhone);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    await prisma.customerNotification.updateMany({
      where: { id, tenantId: notif.tenantId },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (phone && all) {
    const auth = await authorizeAccess(req, phone);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { tenantId } = auth;
    await prisma.customerNotification.updateMany({
      where: { tenantId, customerPhone: phone, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "id or phone+all required" }, { status: 400 });
}
