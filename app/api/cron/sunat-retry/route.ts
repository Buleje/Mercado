/**
 * GET /api/cron/sunat-retry
 *
 * Cron job que procesa la cola de facturas pending/retrying para TODOS los
 * tenants activos con configuración SUNAT.
 *
 * Programado cada 5 minutos en vercel.json:
 *   { "crons": [{ "path": "/api/cron/sunat-retry", "schedule": "every 5 minutes" }] }
 *
 * Protegido con CRON_SECRET (Bearer token que Vercel envía automáticamente).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSunatWorker } from "@/lib/sunat/invoice-worker";
import { logger } from "@/lib/logger";
import { withCronHealth } from "@/lib/cron/with-cron-health";

export const GET = withCronHealth("sunat-retry", async (req: NextRequest) => {
  // Obtener todos los tenants con configuración SUNAT activa
  const configs = await prisma.tenantSunatConfig.findMany({
    select: { tenantId: true },
  });

  if (configs.length === 0) {
    return NextResponse.json({ message: "Sin tenants con config SUNAT", processed: 0 });
  }

  const results: Array<{
    tenantId: string;
    processed: number;
    succeeded: number;
    failed: number;
  }> = [];

  for (const { tenantId } of configs) {
    try {
      const result = await runSunatWorker(tenantId);
      results.push({ tenantId, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[cron/sunat-retry] Error en tenant", { tenantId, error: message });
      results.push({ tenantId, processed: 0, succeeded: 0, failed: 0 });
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      processed: acc.processed + r.processed,
      succeeded: acc.succeeded + r.succeeded,
      failed: acc.failed + r.failed,
    }),
    { processed: 0, succeeded: 0, failed: 0 }
  );

  logger.info("[cron/sunat-retry] Ciclo global completado", totals);

  return NextResponse.json({
    ok: true,
    tenants: configs.length,
    ...totals,
    results,
  });
});
