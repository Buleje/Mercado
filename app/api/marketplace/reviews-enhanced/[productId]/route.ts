/**
 * GET /api/marketplace/reviews-enhanced/[productId]
 *
 * Endpoint público para listar reviews enriquecidas de un producto
 * (con breakdown, filtros, sort, paginación). Devuelve mocks
 * determinísticos por productId.
 *
 * Separado de /api/marketplace/reviews (reviews verificadas + moderación)
 * para no romper el contrato existente. Cuando migremos a reviews reales
 * con fotos se unifican los endpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductReviewsDB } from "@/lib/db/product-reviews.db";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  filter: z.enum(["all", "with_photos", "verified", "helpful"]).optional(),
  sort: z.enum(["recent", "helpful", "rating_high", "rating_low"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId: pidStr } = await params;
  const productId = parseInt(pidStr, 10);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(qs);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // Marketplace es global — tenantId fijo "global" para los mocks.
    const tenantId = "global";

    const [result, breakdown] = await Promise.all([
      ProductReviewsDB.listForProduct(tenantId, productId, parsed.data),
      ProductReviewsDB.getBreakdown(tenantId, productId),
    ]);

    return NextResponse.json(
      {
        data: result.items,
        total: result.total,
        hasMore: result.hasMore,
        breakdown,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=120",
          "X-Total-Count": String(result.total),
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/reviews-enhanced] failed", {
      err: String(err),
      productId,
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
