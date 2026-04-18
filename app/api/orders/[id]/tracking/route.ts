/**
 * GET /api/orders/:orderId/tracking — Estado actual + timeline + driver.
 *
 * Autorización: validar que el `orderId` pertenece al usuario autenticado vía cookie
 * de sesión del cliente (no `requireAdmin`). Por ahora — con datos mock — no
 * consultamos el pedido real. Cuando se reemplace el mock por data real, validar
 * `customerPhone === session.phone` contra `orders.db.ts`.
 */
import { NextResponse } from "next/server";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";
import { OrderIdParamSchema } from "@/lib/validators/order-tracking";
import { resolveTenantSlug } from "@/lib/resolve-tenant";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  const tenantId = (await resolveTenantSlug(rawTenantId)) ?? "main";

  const snapshot = await OrderTrackingDB.getSnapshot(tenantId, parsed.data.orderId);
  if (!snapshot) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
