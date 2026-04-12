import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { getTenantIdFromRequest } from "@/lib/tenant";

/**
 * GET  /api/customer-notifications?phone=XXX       — list notifications (latest 50)
 * POST /api/customer-notifications                  — create notification (internal use)
 * PATCH /api/customer-notifications?id=XXX          — mark as read
 * PATCH /api/customer-notifications?phone=XXX&all=1 — mark all as read
 */

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "cust-notif");
  if (rl) return rl;
  const tenantId = getTenantIdFromRequest(req);

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

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
  const tenantId = getTenantIdFromRequest(req);

  const id = req.nextUrl.searchParams.get("id");
  const phone = req.nextUrl.searchParams.get("phone");
  const all = req.nextUrl.searchParams.get("all");

  if (id) {
    await prisma.customerNotification.updateMany({
      where: { id, tenantId },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (phone && all) {
    await prisma.customerNotification.updateMany({
      where: { tenantId, customerPhone: phone, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "id or phone+all required" }, { status: 400 });
}
