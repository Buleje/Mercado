export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { RecommendationsPersonalizedDB } from "@/lib/db/recommendations-personalized.db";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  customerId:    z.string().optional(),
  customerPhone: z.string().optional(),
  storeSlug:     z.string().optional(),
  limit:         z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { customerId, customerPhone, storeSlug, limit } = parsed.data;
    const customerKey = customerId ?? customerPhone ?? "anonymous";

    logger.debug("recommendations/personalized", { requestId, tenantId, customerKey });

    // Cache 1 hora por tenant + customer
    const cacheKey = `recommendations-personalized:${tenantId}:${customerKey}`;
    const data = await getOrSet(cacheKey, 3600, async () => {
      if (!customerId && !customerPhone) {
        return RecommendationsPersonalizedDB.coldStart(tenantId, { limit });
      }
      return RecommendationsPersonalizedDB.forMe(tenantId, {
        customerId,
        customerPhone,
        storeSlug,
        limit,
      });
    });

    return NextResponse.json({ data, total: data.length });
  } catch (err) {
    logger.error("recommendations/personalized: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
