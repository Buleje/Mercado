/**
 * ADR-047 — GET /api/cron/metering-rollup
 *
 * Cron diario que:
 * 1. Obtiene todos los tenants activos
 * 2. Para cada tenant: agrega el uso del mes corriente
 * 3. Dispara alertas de quota (si corresponde)
 * 4. Loggea el resultado en ActivityLog
 *
 * Idempotente: `getMeteredUsage` lee del ActivityLog acumulado,
 * no hay riesgo de doble-cuenta por reintento.
 *
 * Auth: Bearer <CRON_SECRET> header
 * Invocación: Vercel Cron diario (configurar en vercel.json)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeCompare } from "@/lib/timing-safe";
import {
  getMeteredUsage,
  currentBillingMonth,
  METERED_EVENTS,
  type MeteredEvent,
} from "@/lib/billing/metering";
import { checkQuota } from "@/lib/billing/alerts/quota-checker";
import { notifyQuotaAlert } from "@/lib/billing/alerts/quota-notifier";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  tenantId: z.string().min(1).optional(), // override para test — solo acepta un tenant
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Auth con CRON_SECRET
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!timingSafeCompare(token, secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Parse query opcional
  const url = new URL(req.url);
  const queryParsed = QuerySchema.safeParse({
    tenantId: url.searchParams.get("tenantId") ?? undefined,
  });
  const singleTenant = queryParsed.success ? queryParsed.data.tenantId : undefined;

  const period = currentBillingMonth();
  const startedAt = Date.now();

  // 3. Obtener tenants activos
  let tenantIds: string[];
  try {
    if (singleTenant) {
      tenantIds = [singleTenant];
    } else {
      // Obtener tenants únicos con Settings configurado
      const rows = await prisma.settings.findMany({
        select: { tenantId: true },
        where: { planName: { not: null } },
        take: 500, // Hard cap — si hay >500 tenants migrar a cursor pagination
      });
      tenantIds = rows.map((r) => r.tenantId);
    }
  } catch (err) {
    logger.error("[metering-rollup] failed to load tenants", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error al cargar tenants" }, { status: 500 });
  }

  const results: Record<string, { events: number; alerts: number }> = {};
  let totalAlerts = 0;

  // 4. Para cada tenant: agregar uso y verificar quotas
  await Promise.allSettled(
    tenantIds.map(async (tenantId) => {
      try {
        const usage = await getMeteredUsage(tenantId, period);
        let alertCount = 0;

        for (const event of METERED_EVENTS) {
          const eventUsage = usage[event as MeteredEvent] ?? 0;
          if (eventUsage === 0) continue;

          const checkResult = await checkQuota(tenantId, event as MeteredEvent, eventUsage);
          if (checkResult.level) {
            alertCount++;
            // Obtener email del admin del tenant (Settings.businessEmail)
            const settings = await prisma.settings.findUnique({
              where: { tenantId },
              select: { businessEmail: true },
            });
            notifyQuotaAlert({
              tenantId,
              event: event as MeteredEvent,
              checkResult,
              adminEmail: settings?.businessEmail ?? undefined,
            }).catch((err) => logger.error("[cron/metering-rollup] quota alert notify failed", { error: String(err), tenantId, event }));
          }
        }

        results[tenantId] = {
          events: Object.values(usage).reduce((a, b) => a + b, 0),
          alerts: alertCount,
        };
        totalAlerts += alertCount;

        logActivity(
          "metering.rollup",
          "usage.meter",
          JSON.stringify({ period: period.from.toISOString().slice(0, 7), usage }),
          "rollup",
          "cron",
          undefined,
          tenantId,
        ).catch(() => {});
      } catch (err) {
        logger.error("[metering-rollup] tenant processing failed", {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
        results[tenantId] = { events: 0, alerts: 0 };
      }
    }),
  );

  const elapsed = Date.now() - startedAt;
  logger.info("[metering-rollup] completed", {
    tenants: tenantIds.length,
    totalAlerts,
    elapsedMs: elapsed,
  });

  return NextResponse.json({
    ok: true,
    period: period.from.toISOString().slice(0, 7),
    tenants: tenantIds.length,
    totalAlerts,
    elapsedMs: elapsed,
    results,
  });
}
