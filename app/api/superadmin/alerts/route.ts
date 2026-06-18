import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  buildAlerts,
  alertCounts,
  getAlertConfig,
  type AlertInput,
} from "@/lib/superadmin/alert-rules";

/**
 * GET /api/superadmin/alerts
 *
 * Centro de alertas cross-tenant: un feed único de lo que necesita atención YA.
 * Las condiciones, umbrales y escalación de severidad viven en el motor puro
 * `lib/superadmin/alert-rules` (umbrales configurables vía ALERT_* + escalación
 * por antigüedad/proximidad). Este route sólo arma los datos desde Prisma.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const config = getAlertConfig();
    const now = Date.now();
    const inTrialWarn = new Date(now + config.trialWarnDays * 86_400_000);
    const agoSla = new Date(now - config.slaHours * 3_600_000);
    const agoNew = new Date(now - config.newTenantDays * 86_400_000);
    const agoStale = new Date(now - config.staleTenantDays * 86_400_000);
    const nowD = new Date(now);

    const [urgentTickets, expiringTenants, slaCount, oldestStaleOrder, newCount, activeTenants, ordersByTenant] =
      await Promise.all([
        prisma.supportTicket.findMany({
          where: { status: "open", priority: "high" },
          orderBy: { createdAt: "asc" },
          take: 20,
          select: { id: true, subject: true, tenantId: true, createdAt: true },
        }),
        prisma.tenant.findMany({
          where: { trialEndsAt: { gte: nowD, lte: inTrialWarn } },
          select: { slug: true, name: true, trialEndsAt: true },
        }),
        prisma.order.count({ where: { status: "pendiente", createdAt: { lt: agoSla } } }),
        prisma.order.findFirst({
          where: { status: "pendiente", createdAt: { lt: agoSla } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        prisma.tenant.count({ where: { createdAt: { gte: agoNew } } }),
        prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true, name: true } }),
        prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: agoStale } }, _count: { _all: true } }),
      ]);

    const tenantNames = new Map(activeTenants.map((t) => [t.id, t.name]));
    const tenantsWithRecentOrders = new Set(ordersByTenant.map((r) => r.tenantId));
    const staleTenants = activeTenants.filter((t) => !tenantsWithRecentOrders.has(t.id));

    const input: AlertInput = {
      urgentTickets: urgentTickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        tenantName: tenantNames.get(t.tenantId) ?? t.tenantId,
        createdAt: t.createdAt.toISOString(),
      })),
      expiringTrials: expiringTenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
      })),
      slaCount,
      oldestStaleOrderAt: oldestStaleOrder?.createdAt.toISOString() ?? null,
      newTenantCount: newCount,
      staleTenants: staleTenants.map((t) => ({ name: t.name })),
    };

    const alerts = buildAlerts(input, config, now);
    return NextResponse.json({ alerts, counts: alertCounts(alerts) });
  } catch (e) {
    logger.error("[superadmin/alerts] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
