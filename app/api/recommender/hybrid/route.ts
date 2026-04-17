import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getHybridRecommendations } from "@/lib/recommender/hybrid";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { reportAICall } from "@/lib/billing/wire-up/ai-metering-middleware";

const QuerySchema = z.object({
  productId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

/**
 * GET /api/recommender/hybrid?productId=NN&limit=5
 *
 * Returns hybrid recommendations blending pgvector similarity (70%) with
 * co-purchase frequency (30%). Public endpoint — tenant comes from host.
 * Degrades gracefully to co-purchase-only when pgvector is unavailable.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    productId: url.searchParams.get("productId"),
    limit: url.searchParams.get("limit"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Query invalido", issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }

  let tenantId: string;
  try {
    tenantId = getTenantIdFromRequest(req);
  } catch (err) {
    logger.warn("[api/recommender/hybrid] tenant resolution failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Tenant desconocido" }, { status: 400 });
  }

  const result = await getHybridRecommendations(
    tenantId,
    parsed.data.productId,
    parsed.data.limit,
  );

  // ADR-047 billing wire-up: meter each recommender call (fire-and-forget)
  // Idempotency key: tenantId+productId+minute → max 1 event/min per product
  if (result.source !== "empty") {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    try {
      reportAICall(
        tenantId,
        "ai.recommend.call",
        `rec:${tenantId}:${parsed.data.productId}:${minuteBucket}`,
      );
    } catch {
      // Metering nunca bloquea la respuesta al usuario
    }
  }

  return NextResponse.json({
    source: result.source,
    recommendations: result.recommendations,
  });
}
