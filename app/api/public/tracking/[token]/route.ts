/**
 * GET /api/public/tracking/:token — Tracking público con token HMAC firmado.
 *
 * Sin auth — cualquiera con el link puede ver el estado del pedido.
 * El token valida identidad y caducidad (72h). Expirado o inválido → 404.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";

const ParamsSchema = z.object({
  token: z.string().min(16).max(512),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const params = await ctx.params;
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const verified = await OrderTrackingDB.verifyShareToken(parsed.data.token);
  if (!verified) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 404 });
  }

  const snapshot = await OrderTrackingDB.getSnapshot(
    verified.tenantId,
    verified.orderId,
  );
  if (!snapshot) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // No devolvemos phone del cliente ni payment info sensible en la vista pública.
  const { driver, ...publicSafe } = snapshot;
  return NextResponse.json(
    {
      ...publicSafe,
      driver: driver
        ? {
            name: driver.name,
            vehicle: driver.vehicle,
            rating: driver.rating,
            totalDeliveries: driver.totalDeliveries,
            avatarInitials: driver.avatarInitials,
            // phone omitido en la vista pública
          }
        : null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
