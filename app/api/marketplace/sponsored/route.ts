import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { SponsoredBoostsDB } from "@/lib/db/sponsored-boosts.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const CreateBoostSchema = z.object({
  storeId:      z.string().min(1),
  productId:    z.number().int().positive(),
  bidAmount:    z.number().positive(),
  startDate:    z.string().datetime(),
  endDate:      z.string().datetime(),
  maxBudgetPen: z.number().positive(),
});

/**
 * GET /api/marketplace/sponsored
 * Lista los boosts de la tienda del vendor autenticado.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      // Graceful: widget admin muestra empty state en vez de 400
      return NextResponse.json({ data: [], total: 0 });
    }

    logger.debug("sponsored GET", { requestId, tenantId: auth.tenantId, storeId });

    try {
      const boosts = await SponsoredBoostsDB.listByStore(auth.tenantId, storeId);
      return NextResponse.json({ data: boosts, total: boosts.length });
    } catch (innerErr) {
      // DB failure (ej. tabla no migrada) → widget queda en empty sin romper
      logger.warn("sponsored GET fallback empty", { requestId, err: String(innerErr) });
      return NextResponse.json({ data: [], total: 0 });
    }
  } catch (err) {
    logger.error("sponsored GET: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * POST /api/marketplace/sponsored
 * Crea un boost nuevo para una tienda del vendor autenticado.
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const parsed = CreateBoostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    logger.info("sponsored POST", { requestId, tenantId: auth.tenantId, storeId: parsed.data.storeId });

    const boost = await SponsoredBoostsDB.create(auth.tenantId, parsed.data);
    return NextResponse.json({ data: boost }, { status: 201 });
  } catch (err) {
    logger.error("sponsored POST: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
