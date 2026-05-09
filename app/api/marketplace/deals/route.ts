import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/deals — productos REALES en oferta cross-store.
 * Delegado a MarketplacePublicDB.getDeals() (cache 120s interno).
 * @cross-tenant intentional — agrega StoreProducts de todos los stores publicados.
 */

const QuerySchema = z.object({
  category:         z.string().optional(),
  storeSlug:        z.string().optional(),
  minDiscount:      z.coerce.number().min(0).max(100).default(1),
  limit:            z.coerce.number().int().min(1).max(120).default(60),
  sort:             z.enum(["discount_desc", "price_asc", "ends_soon"]).default("discount_desc"),
  fallbackToLowest: z.coerce.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await MarketplacePublicDB.getDeals(parsed.data);
    logger.info("[marketplace/deals] GET", { traceId, count: result.items.length, source: result.source });

    return NextResponse.json(
      { data: result.items, total: result.items.length, source: result.source },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
    );
  } catch (err) {
    logger.error("[marketplace/deals] GET error", { traceId, err: String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
