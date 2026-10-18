import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import { getRescueQueue } from "@/lib/db/rescue.db";
import { getClientErrors, getClientErrorStats } from "@/lib/db/client-errors.db";
import { logger } from "@/lib/logger";
import {
  compararAvisos,
  contarNiveles,
  cortesPedido,
  nivelAprobacionYape,
  nivelComprobanteApertura,
  nivelErrorDePanel,
  nivelesDePedidos,
  nivelNegocioEnRiesgo,
  nivelPedidoSinAtender,
  nivelSolicitudTienda,
  sumarNiveles,
  type AvisoBandeja,
  type BandejaAvisos,
  type ConteoNiveles,
  type GrupoBandeja,
} from "@/lib/superadmin/nivel-aviso";

/** Cuántos avisos por grupo viajan al modal (el conteo por nivel es del total). */
const TOPE_POR_GRUPO = 40;
/**
 * Pedidos sin atender: bajan TODOS (sin artículos, para agruparlos por tienda
 * en el modal) hasta este tope; los artículos sólo de los más recientes de cada tienda.
 */
const TOPE_PEDIDOS = 400;
const DETALLE_POR_TIENDA = 5;

const ESTADO_YAPE: Record<string, string> = {
  pending: "pendiente",
  review_required: "revisar a mano",
};

function aIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

/** Un grupo: ordena por nivel ANTES de recortar, así lo urgente nunca queda afuera. */
function grupo(count: number, href: string, todos: AvisoBandeja[], niveles?: ConteoNiveles, tope = TOPE_POR_GRUPO): GrupoBandeja {
  return {
    count,
    href,
    niveles: niveles ?? contarNiveles(todos),
    items: [...todos].sort(compararAvisos).slice(0, tope),
  };
}

/** Pedido de cualquier tienda que nadie terminó de atender. */
const PEDIDO_SIN_ATENDER = { status: { in: ["pendiente", "confirmado"] }, deletedAt: null } satisfies Prisma.OrderWhereInput;

/**
 * GET /api/superadmin/notifications/inbox
 *
 * Bandeja agregada de items accionables para el superadmin. Cada bucket
 * incluye `count`, su conteo por nivel (`niveles`) y los primeros items ya
 * clasificados (`nivel` + `motivo`, reglas en `lib/superadmin/nivel-aviso.ts`)
 * para el centro de notificaciones (modal de la campana).
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
    const ahora = new Date();
    const cortes = cortesPedido(ahora);
    const [
      vendorAppsCount,
      vendorAppsTop,
      paymentApprovals,
      paymentProofs,
      pendingOrdersCount,
      ordersEnCurso,
      ordersOlvidados,
      pendingOrdersLista,
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
        take: 200,
        select: {
          id: true,
          businessName: true,
          contactName: true,
          status: true,
          submittedAt: true,
          plan: true,
        },
      }),
      PaymentApprovalDb.listPending({ limit: 200 }).catch(() => []),
      PaymentProofsDB.listPending().catch(() => []),
      prisma.order.count({ where: PEDIDO_SIN_ATENDER }),
      prisma.order.count({ where: { ...PEDIDO_SIN_ATENDER, createdAt: { gte: cortes.enCursoDesde } } }),
      prisma.order.count({ where: { ...PEDIDO_SIN_ATENDER, createdAt: { lt: cortes.olvidadoAntesDe } } }),
      prisma.order.findMany({
        where: PEDIDO_SIN_ATENDER,
        orderBy: { createdAt: "desc" },
        take: TOPE_PEDIDOS,
        select: {
          id: true,
          tenantId: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
          paymentMethod: true,
        },
      }),
      // Señales de soporte proactivo (Brandon 2026-06-20): negocios en riesgo y
      // errores de panel ahora también aparecen en el bell.
      getRescueQueue().catch(() => ({ queue: [], kpis: { critical: 0, high: 0 } })),
      getClientErrors(200).catch(() => []),
      getClientErrorStats().catch(() => ({ groups: 0 })),
    ]);

    // Nombre del negocio de cada pedido y de cada Yape detectado
    const orderTenantIds = [
      ...new Set([...pendingOrdersLista.map((o) => o.tenantId), ...paymentApprovals.map((p) => p.tenantId)].filter(Boolean)),
    ];
    // Artículos (con imagen) sólo de los más recientes de cada tienda: el modal
    // los despliega al abrir el pedido (Brandon 2026-06-05). Los demás son una fila lisa.
    const porTienda = new Map<string, number>();
    const idsConDetalle: string[] = [];
    for (const o of pendingOrdersLista) {
      const n = porTienda.get(o.tenantId) ?? 0;
      if (n < DETALLE_POR_TIENDA) idsConDetalle.push(o.id);
      porTienda.set(o.tenantId, n + 1);
    }
    const detalleRows = idsConDetalle.length
      ? await prisma.order.findMany({
          where: { id: { in: idsConDetalle } },
          select: {
            id: true,
            items: {
              select: {
                id: true,
                name: true,
                quantity: true,
                unit: true,
                price: true,
                image: true,
                // Fallback: pedidos viejos guardaron image="" — usamos la foto
                // actual del producto para que el modal siempre muestre algo.
                product: { select: { image: true } },
              },
            },
          },
        })
      : [];
    const itemsPorPedido = new Map(detalleRows.map((r) => [r.id, r.items]));
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

    const buckets: BandejaAvisos["buckets"] = {
      atRisk: grupo(
        atRiskCount,
        "/superadmin/rescue",
        atRiskRows.map((r) => ({
          id: r.id,
          categoria: "atRisk",
          ...nivelNegocioEnRiesgo(r),
          title: r.name,
          subtitle: r.reasons.slice(0, 2).join(" · ") || r.riskLevel,
          tienda: null,
          status: r.riskLevel,
          createdAt: null,
          href: `/superadmin/tenants/${r.slug}`,
        })),
      ),
      panelErrors: grupo(
        errorStats.groups,
        "/superadmin/tenant-errors",
        panelErrors.map((e) => ({
          id: e.id,
          categoria: "panelErrors",
          ...nivelErrorDePanel(e, ahora),
          title: e.message.slice(0, 140),
          subtitle: `${e.count}×`,
          tienda: e.tenantName,
          status: "error",
          createdAt: e.lastSeenAt,
          href: "/superadmin/tenant-errors",
        })),
      ),
      vendorApplications: grupo(
        vendorAppsCount,
        "/superadmin/vendor-applications",
        vendorAppsTop.map((v) => ({
          id: v.id,
          categoria: "vendorApplications",
          ...nivelSolicitudTienda(v, ahora),
          title: v.businessName,
          subtitle: `${v.contactName} · plan ${v.plan}`,
          tienda: null,
          status: v.status,
          createdAt: v.submittedAt.toISOString(),
          href: `/superadmin/vendor-applications?id=${v.id}`,
        })),
      ),
      paymentApprovals: grupo(
        paymentApprovals.length,
        "/superadmin/pagos-yape",
        paymentApprovals.map((p) => ({
          id: p.id,
          categoria: "paymentApprovals",
          ...nivelAprobacionYape(p, ahora),
          title: `Yape · S/${Number(p.expectedAmount).toFixed(2)}`,
          subtitle: `${p.customerPhone} · ${ESTADO_YAPE[p.status] ?? p.status}`,
          tienda: tenantMap.get(p.tenantId)?.name ?? null,
          status: p.status,
          createdAt: aIso(p.createdAt),
          href: "/superadmin/pagos-yape",
        })),
      ),
      paymentProofs: grupo(
        paymentProofs.length,
        "/superadmin/pagos-pendientes",
        paymentProofs.map((p) => ({
          id: p.id,
          categoria: "paymentProofs",
          ...nivelComprobanteApertura(p, ahora),
          title: `${p.storeName} · S/${Number(p.amountPEN).toFixed(2)}`,
          subtitle: `${p.ownerName} · ${p.method} · plan ${p.planTier}`,
          tienda: null,
          status: "pending",
          createdAt: aIso(p.createdAt),
          href: "/superadmin/pagos-pendientes",
        })),
      ),
      pendingOrders: grupo(
        pendingOrdersCount,
        "/superadmin/orders",
        pendingOrdersLista.map((o): AvisoBandeja => {
          const t = tenantMap.get(o.tenantId);
          const items = itemsPorPedido.get(o.id);
          return {
            id: o.id,
            categoria: "pendingOrders",
            ...nivelPedidoSinAtender(o, ahora),
            title: `${o.customerName} · S/${Number(o.total).toFixed(2)}`,
            subtitle: o.status,
            tienda: t?.name ?? o.tenantId,
            tiendaId: o.tenantId,
            status: o.status,
            createdAt: o.createdAt.toISOString(),
            href: t ? `/superadmin/orders?tenant=${t.slug}` : `/superadmin/orders`,
            // Detalle expandible en el modal (2026-06-05): sólo si trajimos sus artículos.
            order: items
              ? {
                  customerName: o.customerName,
                  tenantName: t?.name ?? o.tenantId,
                  tenantSlug: t?.slug ?? null,
                  total: Number(o.total),
                  paymentMethod: o.paymentMethod,
                  itemsCount: items.reduce((acc, i) => acc + i.quantity, 0),
                  items: items.map((i) => ({
                    id: i.id,
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit,
                    price: Number(i.price),
                    image: i.image || i.product?.image || null,
                  })),
                }
              : undefined,
          };
        }),
        // Los pedidos son muchos (83 el 18-10): se cuentan por nivel con dos
        // `count` con los mismos cortes de la regla, no con los que bajan.
        nivelesDePedidos(pendingOrdersCount, ordersEnCurso, ordersOlvidados),
        TOPE_PEDIDOS,
      ),
    };

    const grupos = Object.values(buckets);
    const respuesta: BandejaAvisos = {
      total: grupos.reduce((acc, g) => acc + g.count, 0),
      niveles: sumarNiveles(grupos.map((g) => g.niveles)),
      buckets,
    };
    return NextResponse.json(respuesta);
  } catch (err) {
    logger.error("[superadmin/notifications/inbox] failed", { err: String(err) });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
