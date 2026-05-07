import "server-only";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkOverdue } from "@/lib/credit/installment-manager";
import { prisma } from "@/lib/prisma";
import { withCronAuth } from "@/lib/cron-auth";

// ── GET /api/cron/credit-overdue ──────────────────────────────────────────────
// Cron diario. Protegido por CRON_SECRET con timing-safe compare + fail-closed
// si el secret no está configurado (FIX 2026-05-06: antes era fail-open).

export const GET = withCronAuth("credit-overdue", async () => {
  logger.info("[cron/credit-overdue] Starting overdue check");

  try {
    // Obtener todos los tenants activos
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    const results: Array<{ tenantId: string; updated: number }> = [];

    for (const tenant of tenants) {
      try {
        const updated = await checkOverdue(tenant.id);
        results.push({ tenantId: tenant.id, updated });

        if (updated > 0) {
          logger.info("[cron/credit-overdue] Updated plans", {
            tenantId: tenant.id,
            updated,
          });
        }
      } catch (err) {
        logger.error("[cron/credit-overdue] Error for tenant", {
          tenantId: tenant.id,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({ tenantId: tenant.id, updated: -1 });
      }
    }

    const totalUpdated = results.filter((r) => r.updated > 0).reduce((s, r) => s + r.updated, 0);

    logger.info("[cron/credit-overdue] Completed", {
      tenantsProcessed: tenants.length,
      totalPlansUpdated: totalUpdated,
    });

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
      totalPlansUpdated: totalUpdated,
      results,
      runAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    logger.error("[cron/credit-overdue] Fatal error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
