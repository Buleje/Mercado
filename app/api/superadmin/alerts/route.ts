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
    // Ventanas de churn: últimos 30d vs los 30d anteriores.
    const ago30 = new Date(now - 30 * 86_400_000);
    const ago60 = new Date(now - 60 * 86_400_000);
    const pendingStatuses = ["pending", "review_required"];

    const [
      urgentTickets, expiringTenants, slaCount, oldestStaleOrder, newCount, activeTenants, ordersByTenant,
      pendingPaymentCount, oldestPendingPayment, curr30Orders, prev30Orders,
    ] = await Promise.all([
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
        // #8 Pagos Yape esperando aprobación (dinero retenido).
        prisma.paymentApproval.count({ where: { status: { in: pendingStatuses } } }),
        prisma.paymentApproval.findFirst({
          where: { status: { in: pendingStatuses } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        // #9 Churn: pedidos por tienda en 30d actuales y 30d previos.
        prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: ago30 } }, _count: { _all: true } }),
        prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: ago60, lt: ago30 } }, _count: { _all: true } }),
      ]);

    const tenantNames = new Map(activeTenants.map((t) => [t.id, t.name]));
    const tenantsWithRecentOrders = new Set(ordersByTenant.map((r) => r.tenantId));
    const staleTenants = activeTenants.filter((t) => !tenantsWithRecentOrders.has(t.id));

    // #9 Riesgo de churn: tiendas activas con caída ≥ churnDropPct vs el período
    // anterior (filtrando volumen mínimo previo para evitar ruido). Top 6.
    const currByTenant = new Map(curr30Orders.map((r) => [r.tenantId, r._count._all]));
    const prevByTenant = new Map(prev30Orders.map((r) => [r.tenantId, r._count._all]));
    const churnRisks = activeTenants
      .map((t) => ({ name: t.name, slug: t.slug, prev: prevByTenant.get(t.id) ?? 0, curr: currByTenant.get(t.id) ?? 0 }))
      .filter((c) => c.prev >= config.churnMinPrev && c.curr < c.prev * (1 - config.churnDropPct))
      .sort((a, b) => (b.prev - b.curr) - (a.prev - a.curr))
      .slice(0, 6);

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
      pendingPayments: {
        count: pendingPaymentCount,
        oldestAt: oldestPendingPayment?.createdAt.toISOString() ?? null,
      },
      churnRisks,
    };

    const alerts = buildAlerts(input, config, now);

    // Estado persistido (#1): reconocer/posponer/resolver. Las resueltas y las
    // pospuestas con snooze vigente se filtran del feed activo; el snooze vencido
    // reactiva la alerta sola.
    const states = await prisma.alertState.findMany({
      where: { alertId: { in: alerts.map((a) => a.id) } },
    });
    const stateMap = new Map(states.map((s) => [s.alertId, s]));
    const isMuted = (id: string): boolean => {
      const s = stateMap.get(id);
      if (!s) return false;
      if (s.status === "resolved") return true;
      if (s.status === "snoozed" && s.snoozedUntil && s.snoozedUntil.getTime() > now) return true;
      return false;
    };
    const withState = alerts.map((a) => {
      const s = stateMap.get(a.id);
      return { ...a, state: s ? { status: s.status, snoozedUntil: s.snoozedUntil?.toISOString() ?? null } : null };
    });
    const active = withState.filter((a) => !isMuted(a.id));
    const muted = withState.filter((a) => isMuted(a.id));

    if (req.nextUrl.searchParams.get("view") === "muted") {
      return NextResponse.json({ alerts: muted, counts: alertCounts(muted), mutedCount: muted.length });
    }
    return NextResponse.json({ alerts: active, counts: alertCounts(active), mutedCount: muted.length });
  } catch (e) {
    logger.error("[superadmin/alerts] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
