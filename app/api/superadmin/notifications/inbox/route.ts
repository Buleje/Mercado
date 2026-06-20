import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import { getRescueQueue } from "@/lib/db/rescue.db";
import { getClientErrors, getClientErrorStats } from "@/lib/db/client-errors.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/notifications/inbox
 *
 * Bandeja agregada de items accionables para el superadmin. Cada bucket
 * incluye `count` y los `top` items para previsualizar en el drawer.
 *
 * Buckets:
 *   - vendorApplications  → solicitudes de tienda nuevas
 *   - paymentApprovals    → aprobaciones Yape pendientes verificación (raw SQL)
 *   - paymentProofs       → comprobantes de apertura de tienda (raw SQL)
 *   - pendingOrders       → pedidos cross-tenant sin entregar
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [
      vendorAppsCount,
      vendorAppsTop,
      paymentApprovals,
      paymentProofs,
      pendingOrdersCount,
      pendingOrdersTop,
      rescue,
      panelErrors,
      errorStats,
    ] = await Promise.all([
      prisma.vendorApplication.count({
        where: { status: { in: ["pending", "under_review", "info_requested"] } },
      }),
      prisma.vendorApplication.findMany({
        where: { status: { in: ["pending", "under_review", "info_requested"] } },
        orderBy: { submittedAt: "desc" },
        take: 5,
        select: {
          id: true,
          businessName: true,
          contactName: true,
          status: true,
          submittedAt: true,
          plan: true,
        },
      }),
      PaymentApprovalDb.listPending({ limit: 50 }).catch(() => []),
      PaymentProofsDB.listPending().catch(() => []),
      prisma.order.count({
        where: {
          status: { in: ["pendiente", "confirmado"] },
          deletedAt: null,
        },
      }),
      prisma.order.findMany({
        where: {
          status: { in: ["pendiente", "confirmado"] },
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          tenantId: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
          paymentMethod: true,
          // Artículos con imagen — el drawer los muestra al expandir el pedido
          // (Brandon 2026-06-05).
          items: {
            select: {
              id: true,
              name: true,
              quantity: true,
              unit: true,
              price: true,
              image: true,
              // Fallback: pedidos viejos guardaron image="" — usamos la foto
              // actual del producto para que el drawer siempre muestre algo.
              product: { select: { image: true } },
            },
          },
        },
      }),
      // Señales de soporte proactivo (Brandon 2026-06-20): negocios en riesgo y
      // errores de panel ahora también aparecen en el bell.
      getRescueQueue().catch(() => ({ queue: [], kpis: { critical: 0, high: 0 } })),
      getClientErrors(5).catch(() => []),
      getClientErrorStats().catch(() => ({ groups: 0 })),
    ]);

    // Tenants for top orders → muestra el nombre del negocio en el drawer
    const orderTenantIds = [...new Set(pendingOrdersTop.map((o) => o.tenantId).filter(Boolean))];
    const tenantMap = new Map<string, { name: string; slug: string }>();
    if (orderTenantIds.length > 0) {
      const tenants = await prisma.tenant.findMany({
        where: {
          OR: [{ id: { in: orderTenantIds } }, { slug: { in: orderTenantIds } }],
        },
        select: { id: true, slug: true, name: true },
      });
      for (const t of tenants) {
        tenantMap.set(t.id, { name: t.name, slug: t.slug });
        tenantMap.set(t.slug, { name: t.name, slug: t.slug });
      }
    }

    const atRiskRows = rescue.queue.filter((r) => r.riskLevel === "critical" || r.riskLevel === "high");
    const atRiskCount = rescue.kpis.critical + rescue.kpis.high;
    const nowIso = new Date().toISOString();

    const totalCount =
      vendorAppsCount + paymentApprovals.length + paymentProofs.length + pendingOrdersCount +
      atRiskCount + errorStats.groups;

    return NextResponse.json({
      total: totalCount,
      buckets: {
        atRisk: {
          count: atRiskCount,
          href: "/superadmin/rescue",
          items: atRiskRows.slice(0, 5).map((r) => ({
            id: r.id,
            title: r.name,
            subtitle: r.reasons.slice(0, 2).join(" · ") || r.riskLevel,
            status: r.riskLevel,
            createdAt: nowIso,
            href: `/superadmin/tenants/${r.slug}`,
          })),
        },
        panelErrors: {
          count: errorStats.groups,
          href: "/superadmin/tenant-errors",
          items: panelErrors.slice(0, 5).map((e) => ({
            id: e.id,
            title: e.message.slice(0, 80),
            subtitle: `${e.tenantName} · ${e.count}×`,
            status: "error",
            createdAt: e.lastSeenAt,
            href: "/superadmin/tenant-errors",
          })),
        },
        vendorApplications: {
          count: vendorAppsCount,
          href: "/superadmin/vendor-applications",
          items: vendorAppsTop.map((v) => ({
            id: v.id,
            title: v.businessName,
            subtitle: `${v.contactName} · plan ${v.plan}`,
            status: v.status,
            createdAt: v.submittedAt.toISOString(),
            href: `/superadmin/vendor-applications?id=${v.id}`,
          })),
        },
        paymentApprovals: {
          count: paymentApprovals.length,
          href: "/superadmin/pagos-yape",
          items: paymentApprovals.slice(0, 5).map((p) => ({
            id: p.id,
            title: `Yape · S/${Number(p.expectedAmount).toFixed(2)}`,
            subtitle: `${p.customerPhone} · ${p.status}`,
            status: p.status,
            createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
            href: "/superadmin/pagos-yape",
          })),
        },
        paymentProofs: {
          count: paymentProofs.length,
          href: "/superadmin/pagos-pendientes",
          items: paymentProofs.slice(0, 5).map((p) => ({
            id: p.id,
            title: `${p.storeName} · S/${Number(p.amountPEN).toFixed(2)}`,
            subtitle: `${p.ownerName} · ${p.method} · plan ${p.planTier}`,
            status: "pending",
            createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
            href: "/superadmin/pagos-pendientes",
          })),
        },
        pendingOrders: {
          count: pendingOrdersCount,
          href: "/superadmin/orders",
          items: pendingOrdersTop.map((o) => {
            const t = tenantMap.get(o.tenantId);
            return {
              id: o.id,
              title: `${o.customerName} · S/${Number(o.total).toFixed(2)}`,
              subtitle: t ? `${t.name} · ${o.status}` : `${o.tenantId} · ${o.status}`,
              status: o.status,
              createdAt: o.createdAt.toISOString(),
              href: t ? `/superadmin/orders?tenant=${t.slug}` : `/superadmin/orders`,
              // Detalle expandible en el drawer (2026-06-05)
              order: {
                customerName: o.customerName,
                tenantName: t?.name ?? o.tenantId,
                tenantSlug: t?.slug ?? null,
                total: Number(o.total),
                paymentMethod: o.paymentMethod,
                itemsCount: o.items.reduce((acc, i) => acc + i.quantity, 0),
                items: o.items.map((i) => ({
                  id: i.id,
                  name: i.name,
                  quantity: i.quantity,
                  unit: i.unit,
                  price: Number(i.price),
                  image: i.image || i.product?.image || null,
                })),
              },
            };
          }),
        },
      },
    });
  } catch (err) {
    logger.error("[superadmin/notifications/inbox] failed", { err: String(err) });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
