/**
 * GET /api/me/notifications
 *
 * Customer notification inbox — returns recent notifications
 * for the authenticated customer (order updates, promotions, alerts).
 *
 * Query params:
 *   ?limit=20     — max items (default 20, max 50)
 *   ?unread=true  — filter only unread
 *
 * Auth: requireCustomer
 * Schema: CustomerNotification has `read` (boolean) and `body` (not message)
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { anonymousGate } from "@/lib/auth/anonymous-gate";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Next 16 con cacheComponents: force-dynamic es redundante.

export async function GET(req: NextRequest) {
  const anon = anonymousGate(req);
  if (anon) return anon;

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: customerPhone } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(limitParam, 1), 50);
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  try {
    const where = {
      tenantId,
      customerPhone,
      ...(unreadOnly ? { read: false } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.customerNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          read: true,
          createdAt: true,
        },
      }),
      prisma.customerNotification.count({
        where: { tenantId, customerPhone, read: false },
      }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.body,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt,
      })),
      unreadCount,
      total: notifications.length,
    });
  } catch (err) {
    logger.error("[me/notifications] Error", { tenantId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/me/notifications — mark notifications as read
 * Body: { ids: string[] } or { all: true }
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "me-notifications"); if (_rl) return _rl;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: customerPhone } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  const body = await req.json().catch((err) => {
    logger.warn("Invalid JSON body in me/notifications POST", { err: err instanceof Error ? err.message : String(err) });
    return null;
  });

  try {
    if (body?.all === true) {
      await prisma.customerNotification.updateMany({
        where: { tenantId, customerPhone, read: false },
        data: { read: true },
      });
      return NextResponse.json({ ok: true, message: "Todas leidas" });
    }

    if (Array.isArray(body?.ids) && body.ids.length > 0) {
      await prisma.customerNotification.updateMany({
        where: {
          id: { in: body.ids },
          tenantId,
          customerPhone,
          read: false,
        },
        data: { read: true },
      });
      return NextResponse.json({ ok: true, marked: body.ids.length });
    }

    return NextResponse.json({ error: "Enviar { ids: [...] } o { all: true }" }, { status: 400 });
  } catch (err) {
    logger.error("[me/notifications] POST error", { tenantId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
