import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SponsoredBoostsDB } from "@/lib/db/sponsored-boosts.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { withCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/marketplace-sponsored-cleanup
 * Cron diario (01:00) que expira los SponsoredBoosts vencidos en todos los tenants.
 *
 * SECURITY 2026-05-06: migrado a `withCronAuth` (timing-safe + fail-closed).
 * Antes el compare era `!==` (no timing-safe) y se saltaba si CRON_SECRET no
 * estaba configurado (fail-open).
 */
export const GET = withCronAuth("marketplace-sponsored-cleanup", async (req) => {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

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
});
