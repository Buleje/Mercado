import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/alerts
 *
 * Centro de alertas cross-tenant (Brandon 2026-06-14): un feed único de lo que
 * necesita atención YA. Calcula desde datos reales:
 *  - tickets urgentes sin responder (critical)
 *  - trials por vencer ≤3d (warning)
 *  - pedidos SLA roto: pendientes >2h (warning, agregado)
 *  - tiendas estancadas: activas sin pedidos en 30d (warning, agregado)
 *  - tiendas nuevas 7d (info, agregado)
 */

type Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  kind: string;
  title: string;
  detail: string;
  href: string;
  at: string | null;
};

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const now = Date.now();
    const in3d = new Date(now + 3 * 86_400_000);
    const ago2h = new Date(now - 2 * 3_600_000);
    const ago7d = new Date(now - 7 * 86_400_000);
    const ago30d = new Date(now - 30 * 86_400_000);
    const nowD = new Date(now);

    const [urgentTickets, expiringTenants, slaCount, newCount, activeTenants, ordersByTenant] = await Promise.all([
      prisma.supportTicket.findMany({
        where: { status: "open", priority: "high" },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true, subject: true, tenantId: true, createdAt: true },
      }),
      prisma.tenant.findMany({
        where: { trialEndsAt: { gte: nowD, lte: in3d } },
        select: { slug: true, name: true, trialEndsAt: true },
      }),
      prisma.order.count({ where: { status: "pendiente", createdAt: { lt: ago2h } } }),
      prisma.tenant.count({ where: { createdAt: { gte: ago7d } } }),
      prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true, name: true } }),
      prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: ago30d } }, _count: { _all: true } }),
    ]);

    const tenantNames = new Map(activeTenants.map((t) => [t.id, t.name]));
    const tenantsWithRecentOrders = new Set(ordersByTenant.map((r) => r.tenantId));
    const staleTenants = activeTenants.filter((t) => !tenantsWithRecentOrders.has(t.id));

    const alerts: Alert[] = [];

    for (const t of urgentTickets) {
      alerts.push({
        id: `ticket-${t.id}`,
        severity: "critical",
        kind: "ticket",
        title: "Ticket urgente sin responder",
        detail: `${tenantNames.get(t.tenantId) ?? t.tenantId}: ${t.subject}`,
        href: "/superadmin/support",
        at: t.createdAt.toISOString(),
      });
    }
    for (const t of expiringTenants) {
      const days = t.trialEndsAt ? Math.max(0, Math.round((t.trialEndsAt.getTime() - now) / 86_400_000)) : 0;
      alerts.push({
        id: `trial-${t.slug}`,
        severity: "warning",
        kind: "trial",
        title: `Trial vence en ${days}d`,
        detail: t.name,
        href: "/superadmin/tenants?qf=trial-expiring",
        at: t.trialEndsAt?.toISOString() ?? null,
      });
    }
    if (slaCount > 0) {
      alerts.push({
        id: "sla",
        severity: "warning",
        kind: "sla",
        title: `${slaCount} pedidos sin atender >2h`,
        detail: "Pedidos pendientes que rompen el SLA",
        href: "/superadmin/orders",
        at: null,
      });
    }
    if (staleTenants.length > 0) {
      alerts.push({
        id: "stale",
        severity: "warning",
        kind: "stale",
        title: `${staleTenants.length} tiendas sin pedidos en 30d`,
        detail: staleTenants.slice(0, 4).map((t) => t.name).join(", ") + (staleTenants.length > 4 ? "…" : ""),
        href: "/superadmin/tenants/onboarding",
        at: null,
      });
    }
    if (newCount > 0) {
      alerts.push({
        id: "new",
        severity: "info",
        kind: "new",
        title: `${newCount} tiendas nuevas (7d)`,
        detail: "Altas recientes — revisá su activación",
        href: "/superadmin/tenants?sort=createdAt",
        at: null,
      });
    }

    const rank = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);

    const counts = {
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
      total: alerts.length,
    };
    return NextResponse.json({ alerts, counts });
  } catch (e) {
    logger.error("[superadmin/alerts] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
