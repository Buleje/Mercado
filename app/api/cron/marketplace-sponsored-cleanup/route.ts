import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SponsoredBoostsDB } from "@/lib/db/sponsored-boosts.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/marketplace-sponsored-cleanup
 * Cron diario (01:00) que expira los SponsoredBoosts vencidos en todos los tenants.
 *
 * Schedule en vercel.json: "0 1 * * *"
 * Autenticación: CRON_SECRET header (Vercel lo envía automáticamente en producción).
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  // Verificar secreto de cron
  const cronSecret = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    cronSecret !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logger.info("cron/marketplace-sponsored-cleanup: inicio", { requestId });

    // Obtener todos los tenantIds activos que tienen boosts
    const tenants = await prisma.sponsoredBoost.groupBy({
      by: ["tenantId"],
      where: { status: { in: ["active", "paused"] } },
    });

    let totalExpired = 0;
    const results: { tenantId: string; expired: number }[] = [];

    for (const { tenantId } of tenants) {
      const expired = await SponsoredBoostsDB.expireOld(tenantId);
      totalExpired += expired;
      if (expired > 0) {
        results.push({ tenantId, expired });
      }
    }

    logger.info("cron/marketplace-sponsored-cleanup: completado", {
      requestId,
      tenantsProcessed: tenants.length,
      totalExpired,
    });

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
      totalExpired,
      results,
    });
  } catch (err) {
    logger.error("cron/marketplace-sponsored-cleanup: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
