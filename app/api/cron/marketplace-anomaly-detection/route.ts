/**
 * app/api/cron/marketplace-anomaly-detection/route.ts
 *
 * Cron diario (11pm UTC). Por cada store publicado del marketplace:
 *   1. Llama SalesAnomaliesDB.detect() para comparar día actual vs hace 7 días.
 *   2. Para anomalías high/critical no notificadas, encola WhatsApp al Tenant.ownerPhone.
 *   3. Marca como notifiedAt.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SalesAnomaliesDB } from "@/lib/db";
import { logger } from "@/lib/logger";
import { enqueueNotification } from "@/lib/queue/queues";
import { reportCriticalError } from "@/lib/sentry-alerts";

function validateCronSecret(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret) return false;
  return secret === expected;
}

function buildAnomalyMessage(args: {
  storeName: string;
  metric: string;
  direction: "drop" | "spike";
  deltaPct: number;
}): string {
  const arrow = args.direction === "drop" ? "⚠️ Caída" : "📈 Subida";
  const metricLabel: Record<string, string> = {
    revenue: "ventas",
    orders: "pedidos",
    units: "unidades vendidas",
    aov: "ticket promedio",
  };
  const label = metricLabel[args.metric] ?? args.metric;
  return `${arrow} en ${label} (${Math.abs(args.deltaPct).toFixed(1)}%) en ${args.storeName}`;
}

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    logger.warn("[marketplace-anomaly-detection] Invalid CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stores = await prisma.store.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        tenantId: true,
        slug: true,
        name: true,
        tenant: { select: { ownerPhone: true } },
      },
    });

    logger.info("[marketplace-anomaly-detection] Starting", { storeCount: stores.length });

    let totalDetected = 0;
    let totalNotified = 0;

    for (const store of stores) {
      try {
        const count = await SalesAnomaliesDB.detect(store.tenantId, store.id);
        totalDetected += count;
        if (count === 0) continue;

        const criticalAnomalies = await SalesAnomaliesDB.getRecent(
          store.tenantId,
          store.id,
          { severity: ["critical", "high"], limit: 20 },
        );
        const toNotify = criticalAnomalies.filter((a) => !a.notifiedAt);
        if (toNotify.length === 0) continue;

        const recipient = store.tenant?.ownerPhone;
        if (recipient) {
          for (const anomaly of toNotify) {
            await enqueueNotification({
              type: "whatsapp",
              recipient,
              message: buildAnomalyMessage({
                storeName: store.name,
                metric: anomaly.metric,
                direction: anomaly.direction,
                deltaPct: anomaly.deltaPct,
              }),
              tenantId: store.tenantId,
              metadata: {
                anomalyId: anomaly.id,
                metric: anomaly.metric,
                severity: anomaly.severity,
                direction: anomaly.direction,
                deltaPct: anomaly.deltaPct,
                expected: anomaly.expected.toFixed(2),
                actual: anomaly.actual.toFixed(2),
              },
            }).catch((err) => {
              logger.warn("[marketplace-anomaly-detection] enqueue failed", {
                storeId: store.id,
                anomalyId: anomaly.id,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        }

        await SalesAnomaliesDB.markNotified(
          store.tenantId,
          toNotify.map((a) => a.id),
        );
        totalNotified += toNotify.length;
      } catch (err) {
        logger.error("[marketplace-anomaly-detection] Error per store", {
          storeId: store.id,
          tenantId: store.tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[marketplace-anomaly-detection] Completed", {
      totalDetected,
      totalNotified,
      storeCount: stores.length,
    });
    return NextResponse.json({
      ok: true,
      totalDetected,
      totalNotified,
      storeCount: stores.length,
    });
  } catch (err) {
    logger.error("[marketplace-anomaly-detection] Fatal error", {
      error: err instanceof Error ? err.message : String(err),
    });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "marketplace-anomaly-detection",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
