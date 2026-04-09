import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ReviewVotesDB, type VoteType } from "@/lib/db/reviews.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * POST /api/marketplace/reviews/[reviewId]/vote
 * El buyer vota una review como útil o no útil.
 *
 * Body: { storeSlug, customerPhone, voteType: "upvote"|"downvote" }
 *
 * Dedupe: el ReviewVotesDB garantiza que un mismo customerPhone solo
 * puede votar una review una vez. Si cambia el tipo de voto, se ajustan
 * los contadores. Si ya votó con el mismo tipo, no se hace nada.
 */

const VoteBody = z.object({
  storeSlug:     z.string().min(1).max(200),
  customerPhone: z.string().min(6).max(20),
  voteType:      z.enum(["upvote", "downvote"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  if (!isFeatureEnabled("marketplace-reviews-public")) {
    return NextResponse.json(
      { error: "Reviews temporalmente no disponibles" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const { reviewId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = VoteBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // 1. Resolver la tienda para obtener tenantId + verificar publicada
    const store = await prisma.store.findUnique({
      where: { slug: parsed.data.storeSlug },
      select: { id: true, tenantId: true, isPublished: true },
    });
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    // 2. Verificar que la review existe en este tenant (defense in depth)
    const reviewRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; tenantId: string; deletedAt: Date | null }>
    >(
      `SELECT "id","tenantId","deletedAt"
         FROM "Review"
        WHERE "id" = $1 AND "tenantId" = $2 AND "status" = 'approved'
        LIMIT 1`,
      reviewId,
      store.tenantId,
    );
    if (!reviewRows[0] || reviewRows[0].deletedAt) {
      return NextResponse.json({ error: "Review no encontrada" }, { status: 404 });
    }

    // 3. Votar
    const counts = await ReviewVotesDB.vote({
      tenantId:      store.tenantId,
      reviewId,
      customerPhone: parsed.data.customerPhone,
      voteType:      parsed.data.voteType as VoteType,
    });

    return NextResponse.json({ data: counts });
  } catch (err) {
    logger.error("[reviews/vote] failed", { err: String(err), reviewId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/marketplace/reviews/vote",
      extra: { verb: "POST", reviewId },
      tags: { severity_user_facing: "true" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
