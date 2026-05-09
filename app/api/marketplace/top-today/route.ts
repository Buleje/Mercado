import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(5).max(20).default(10),
});

/**
 * GET /api/marketplace/top-today
 *
 * Ranking de productos más pedidos (24h con fallback a 7d).
 * Delegado a MarketplacePublicDB.getTopToday() (cache 120s interno).
 * @cross-tenant intentional — agrega OrderItems de todos los tenants.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({ limit: searchParams.get("limit") ?? 10 });
    if (!parsed.success) {
      return NextResponse.json({ error: "limit inválido (5-20)", traceId }, { status: 400 });
    }

    const result = await MarketplacePublicDB.getTopToday(parsed.data.limit);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    logger.error("[marketplace/top-today] failed", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
