/**
 * GET /api/orders/:orderId/tracking?phone=<customerPhone> — Estado + timeline + driver.
 *
 * SECURITY (HOTFIX-A1, 2026-04-29): IDOR cerrado. El caller debe demostrar
 * propiedad del pedido enviando el `customerPhone` exacto usado en el
 * checkout. Sin match → 404 indistinguible (no oracle de IDs). Mismo patrón
 * que `/api/orders/[id]/public/route.ts` (HOTFIX-003).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";
import { OrderIdParamSchema } from "@/lib/validators/order-tracking";
import { normalizePhone } from "@/lib/db/misc.db";
import { logger } from "@/lib/logger";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const parsed = OrderIdParamSchema.safeParse({ orderId: id });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_order_id",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    // Step 1: ownership check — fetch tenantId + customerPhone only (no PII leak).
    const orderMeta = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      select: { tenantId: true, customerPhone: true },
    });

    const url = new URL(req.url);
    const providedPhone = url.searchParams.get("phone");
    const normalizedProvided = providedPhone ? normalizePhone(providedPhone) : null;

    if (
      !orderMeta ||
      !orderMeta.customerPhone ||
      !normalizedProvided ||
      normalizedProvided !== orderMeta.customerPhone
    ) {
      // Single 404 for all failure modes — prevents ID enumeration.
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const snapshot = await OrderTrackingDB.getSnapshot(orderMeta.tenantId, parsed.data.orderId);
    if (!snapshot) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
