import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/tenants/[slug]/overview — Ficha 360 del negocio (Brandon
 * 2026-06-19, idea #2). Junta en una sola pantalla TODO lo de un tenant, medido
 * en vivo: identidad/plan, health score + engagement (TenantHealthScore),
 * conteos (productos/clientes/pedidos/errores), integraciones (Settings),
 * pedidos recientes, errores del panel (ClientErrorLog) y actividad (ActivityLog).
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      select: { id: true, name: true, slug: true, active: true, plan: true, trialEndsAt: true, createdAt: true, logoUrl: true, customDomain: true },
    });
    if (!tenant) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });

    const id = tenant.id;
    const [health, settings, products, customers, orders, recentOrders, errorRows, errorCount, activity] = await Promise.all([
      prisma.tenantHealthScore.findFirst({ where: { tenantId: id }, orderBy: { calculatedAt: "desc" } }),
      prisma.settings.findUnique({ where: { tenantId: id }, select: { businessAddress: true, yapeEnabled: true, plinEnabled: true, whatsappApiToken: true, sunatProvider: true } }),
      prisma.product.count({ where: { tenantId: id } }),
      prisma.customer.count({ where: { tenantId: id } }),
      prisma.order.count({ where: { tenantId: id } }),
      prisma.order.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, total: true, status: true, createdAt: true } }),
      prisma.clientErrorLog.findMany({ where: { tenantId: id, resolvedAt: null }, orderBy: { lastSeenAt: "desc" }, take: 5, select: { id: true, message: true, source: true, count: true, lastSeenAt: true } }),
      prisma.clientErrorLog.count({ where: { tenantId: id, resolvedAt: null } }),
      prisma.activityLog.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 12, select: { action: true, entity: true, detail: true, user: true, createdAt: true } }),
    ]);

    return NextResponse.json({
      tenant: {
        id: tenant.id, name: tenant.name, slug: tenant.slug, active: tenant.active, plan: tenant.plan,
        trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null, createdAt: tenant.createdAt.toISOString(),
        logoUrl: tenant.logoUrl ?? null, customDomain: tenant.customDomain ?? null, address: settings?.businessAddress ?? null,
      },
      health: health ? {
        score: health.score, riskLevel: health.riskLevel,
        loginsLast7d: health.loginsLast7d, loginsLast30d: health.loginsLast30d,
        ordersLast7d: health.ordersLast7d, ordersLast30d: health.ordersLast30d,
        featuresUsed: health.featuresUsed, daysSinceLastOrder: health.daysSinceLastOrder,
        daysSinceLastLogin: health.daysSinceLastLogin, trialDaysLeft: health.trialDaysLeft,
        calculatedAt: health.calculatedAt.toISOString(),
      } : null,
      counts: { products, customers, orders, errors: errorCount },
      integrations: {
        whatsapp: !!settings?.whatsappApiToken, yape: !!settings?.yapeEnabled,
        plin: !!settings?.plinEnabled, sunat: !!settings?.sunatProvider,
      },
      recentOrders: recentOrders.map((o) => ({ id: o.id, total: Number(o.total), status: o.status, createdAt: o.createdAt.toISOString() })),
      errors: errorRows.map((e) => ({ id: e.id, message: e.message, source: e.source, count: e.count, lastSeenAt: e.lastSeenAt.toISOString() })),
      activity: activity.map((a) => ({ action: a.action, entity: a.entity, detail: a.detail, user: a.user, createdAt: a.createdAt.toISOString() })),
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/tenants/overview] error", { slug, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
