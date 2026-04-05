import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkOverdue } from "@/lib/credit/installment-manager";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET /api/cron/credit-overdue ──────────────────────────────────────────────
// Cron diario. Protegido por CRON_SECRET (Vercel Cron Jobs).
// Configura en vercel.json:
//   { "crons": [{ "path": "/api/cron/credit-overdue", "schedule": "0 6 * * *" }] }

export async function GET(req: NextRequest) {
  // Validar CRON_SECRET para evitar ejecuciones no autorizadas
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("[cron/credit-overdue] Unauthorized attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[cron/credit-overdue] Starting overdue check");

  try {
    // Obtener todos los tenants activos
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
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
}
