import { NextRequest, NextResponse } from "next/server";
import { OrdersDB } from "@/lib/jsondb";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/db/misc.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/orders/[id]/public?phone=<customerPhone>
 *
 * HOTFIX-003 — IDOR closed: the caller must prove ownership of the order by
 * supplying the exact customer phone used at checkout. Without a matching
 * phone the endpoint returns 404 (not 403) so an attacker cannot distinguish
 * "order does not exist" from "wrong phone" and iterate IDs to harvest PII.
 *
 * The natural caller is a customer arriving from a WhatsApp confirmation
 * link or from the tracking UI — both already know the customer phone.
 *
 * Rate-limited: MODERATE preset (20 req / 5 min per IP).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = applyRateLimit(req, "MODERATE", "public-order");
  if (limited) return limited;

  const { id } = await params;

  try {
    // Step 1: lightweight lookup that leaks nothing — only tenantId and the
    // stored (already normalized) customer phone. No PII returned yet.
    // eslint-disable-next-line no-restricted-properties -- public IDOR-protected lookup; phone match guard antes de devolver datos.
    const orderMeta = await prisma.order.findUnique({
      where: { id },
      select: { tenantId: true, customerPhone: true },
    });

    // Normalize caller-supplied phone the same way checkout does.
    const providedPhone = req.nextUrl.searchParams.get("phone");
    const normalizedProvided = providedPhone ? normalizePhone(providedPhone) : null;

    // Collapse all failure cases into a single 404 response so the endpoint
    // cannot be used as an ID oracle.
    if (
      !orderMeta ||
      !orderMeta.customerPhone ||
      !normalizedProvided ||
      normalizedProvided !== orderMeta.customerPhone
    ) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    // Step 2: phone matches — now pull the full order scoped to the order's
    // own tenant (HOTFIX-002 requires tenantId as the first argument).
    const order = await OrdersDB.getById(orderMeta.tenantId, id);
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      id: order.id,
      status: order.status,
      customerName: order.customer.name.split(" ")[0],
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      total: order.total,
      paymentMethod: order.paymentMethod ?? null,
      notes: order.notes ?? null,
      deliverySlot: order.deliverySlot ?? null,
      couponDiscount: order.couponDiscount ?? null,
      discountAmount: order.discountAmount ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  } catch (e) {
    logger.error("[orders/id/public] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
