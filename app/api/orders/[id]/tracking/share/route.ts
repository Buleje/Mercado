/**
 * POST /api/orders/:orderId/tracking/share — Genera token público (HMAC) para
 * compartir el tracking por WhatsApp. Vive 72h.
 *
 * Respuesta:
 *   { token, url, expiresAt }
 *
 * El token es stateless — no persistimos nada. HMAC con AUTH_SECRET asegura que
 * nadie puede forjar un token sin la llave del servidor.
 */
import { NextResponse } from "next/server";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";
import {
  OrderIdParamSchema,
  ShareTokenRequestSchema,
} from "@/lib/validators/order-tracking";
import { resolveTenantSlug } from "@/lib/resolve-tenant";
import { applyRateLimit } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // Rate limit — evitar que un usuario genere miles de tokens.
  const rl = applyRateLimit(req, "GENEROUS", "tracking-share");
  if (rl) return rl;

  const { id } = await ctx.params;
  const parsedParams = OrderIdParamSchema.safeParse({ orderId: id });
  if (!parsedParams.success) {
    return NextResponse.json(
      {
        error: "invalid_order_id",
        issues: parsedParams.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const bodyParsed = ShareTokenRequestSchema.partial().safeParse({
    orderId: parsedParams.data.orderId,
    ...body,
  });
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        issues: bodyParsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }

  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  const tenantId = (await resolveTenantSlug(rawTenantId)) ?? "main";

  const ttlMs = bodyParsed.data.ttlSeconds
    ? bodyParsed.data.ttlSeconds * 1000
    : undefined;

  // Validar que el pedido exista (mock siempre retorna válido en dev).
  const snap = await OrderTrackingDB.getSnapshot(tenantId, parsedParams.data.orderId);
  if (!snap) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await OrderTrackingDB.generateShareToken(
    tenantId,
    parsedParams.data.orderId,
    ttlMs,
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
