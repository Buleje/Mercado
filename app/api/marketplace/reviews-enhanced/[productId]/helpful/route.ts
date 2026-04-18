/**
 * POST /api/marketplace/reviews-enhanced/[productId]/helpful
 *
 * Marca una review como "útil". Hoy es un noop (mock); cuando migremos a
 * DB real, persistirá el voto por customerPhone para dedupe.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductReviewsDB } from "@/lib/db/product-reviews.db";
import { logger } from "@/lib/logger";

const Body = z.object({
  reviewId: z.string().min(1).max(100),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId: pidStr } = await params;
  const productId = parseInt(pidStr, 10);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "reviewId requerido" }, { status: 400 });
  }

  try {
    await ProductReviewsDB.markHelpful("global", parsed.data.reviewId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[marketplace/reviews-enhanced/helpful] failed", {
      err: String(err),
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
