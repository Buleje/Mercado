/**
 * POST /api/orders/:orderId/tracking/share — Genera token público (HMAC) para
 * compartir el tracking por WhatsApp. Vive 24h.
 *
 * Respuesta:
 *   { token, url, expiresAt }
 *
 * El token es stateless — no persistimos nada. HMAC con AUTH_SECRET asegura que
 * nadie puede forjar un token sin la llave del servidor.
 */
import { NextRequest, NextResponse } from "next/server";
import { tryAdmin } from "@/lib/require-admin";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";
import {
  OrderIdParamSchema,
  ShareTokenRequestSchema,
} from "@/lib/validators/order-tracking";
import { applyRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
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

    // SECURITY 2026-05-06 (pentest H002): autorizar emisión del token.
    // Antes: cualquiera con un orderId podía generar token público (72h).
    // Ahora: solo admins del tenant del order, o cliente que provee
    // customerPhone matching el del order.
    const session = await tryAdmin(req);
    const order = await prisma.order.findUnique({
      where: { id: parsedParams.data.orderId },
      select: { id: true, tenantId: true, customerPhone: true },
    });
    if (!order) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let tenantId: string;
    if (session) {
      if (session.tenantId !== order.tenantId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      tenantId = session.tenantId;
    } else {
      // Cliente sin sesión admin: requiere customerPhone que matchee.
      const callerPhone =
        typeof (body as { customerPhone?: unknown }).customerPhone === "string"
          ? ((body as { customerPhone: string }).customerPhone ?? "").replace(/\D/g, "")
          : "";
      const orderPhone = (order.customerPhone ?? "").replace(/\D/g, "");
      if (!callerPhone || !orderPhone || callerPhone !== orderPhone) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      tenantId = order.tenantId;
    }

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

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
