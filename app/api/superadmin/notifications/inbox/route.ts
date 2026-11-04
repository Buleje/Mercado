import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import type { ApplicationStatus, Prisma } from "@/lib/generated/prisma/client";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";
import { getRescueQueue } from "@/lib/db/rescue.db";
import { getClientErrors, getClientErrorStats } from "@/lib/db/client-errors.db";
import { logger } from "@/lib/logger";
import { SupportTicketsDB } from "@/lib/db/support-tickets.db";
import { ENTITY_TYPE_ETIQUETA } from "@/lib/soporte/correccion-guia";
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
  nivelSolicitudCorreccion,
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
/** Solicitudes de tienda que siguen abiertas; con menos que el tope, la lista ya es el conteo. */
const SOLICITUD_ABIERTA: ApplicationStatus[] = ["pending", "under_review", "info_requested"];
const TOPE_SOLICITUDES = 200;

const ESTADO_YAPE: Record<string, string> = {
  pending: "pendiente",
  review_required: "revisar a mano",
};

function aIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

/** Un grupo: ordena por nivel ANTES de recortar, así lo urgente nunca queda afuera. */
function grupo(
  count: number,
  href: string,
  todos: AvisoBandeja[],
  niveles?: ConteoNiveles,
  tope = TOPE_POR_GRUPO,
): GrupoBandeja {
  return {
    count,
    href,
    niveles: niveles ?? contarNiveles(todos),
    items: [...todos].sort(compararAvisos).slice(0, tope),
  };
}

/** Pedido de cualquier tienda que nadie terminó de atender. */
const PEDIDO_SIN_ATENDER = {
  status: { in: ["pendiente", "confirmado"] },
  deletedAt: null,
} satisfies Prisma.OrderWhereInput;

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
 *   - supportCorrections  → negocios que piden corregir una guía emitida (ADR-512)
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
      vendorAppsTop,
      paymentApprovals,
      paymentProofs,
      pendingOrdersLista,
      rescue,
      panelErrors,
      errorStats,
      correcciones,
    ] = await Promise.all([
      prisma.vendorApplication.findMany({
        where: { status: { in: SOLICITUD_ABIERTA } },
        orderBy: { submittedAt: "desc" },
        take: TOPE_SOLICITUDES,
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
      SupportTicketsDB.correccionesAbiertasPlataforma(200).catch((err) => {
        logger.warn("[superadmin/notifications/inbox] correcciones no leídas", {
          error: String(err),
        });
        return { count: 0, filas: [] };
      }),
    ]);

    // Nombre del negocio de cada pedido y de cada Yape detectado
    const orderTenantIds = [
      ...new Set(
        [
          ...pendingOrdersLista.map((o) => o.tenantId),
          ...paymentApprovals.map((p) => p.tenantId),
        ].filter(Boolean),
      ),
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
    // Detalle de artículos, nombres de negocio y (sólo si la lista llenó el tope) el conteo
    // real de solicitudes: en UNA tanda, no en fila (04-11: la campana tardaba 1,2 s en caliente).
    const [
      detalleRows,
      tenants,
      vendorAppsCount,
      [pendingOrdersCount, ordersEnCurso, ordersOlvidados],
    ] = await Promise.all([
      idsConDetalle.length
        ? prisma.order.findMany({
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
        : Promise.resolve([]),
      orderTenantIds.length > 0
        ? prisma.tenant.findMany({
            where: {
              OR: [{ id: { in: orderTenantIds } }, { slug: { in: orderTenantIds } }],
            },
            select: { id: true, slug: true, name: true },
          })
        : Promise.resolve([]),
      vendorAppsTop.length < TOPE_SOLICITUDES
        ? Promise.resolve(vendorAppsTop.length)
        : prisma.vendorApplication.count({ where: { status: { in: SOLICITUD_ABIERTA } } }),
      // Con menos pedidos que el tope, la lista ya trae todos: se cuentan en memoria
      // (3 idas a la base menos). Sólo si llenó el tope se cuenta en la base.
      pendingOrdersLista.length < TOPE_PEDIDOS
        ? Promise.resolve([
            pendingOrdersLista.length,
            pendingOrdersLista.filter((o) => o.createdAt >= cortes.enCursoDesde).length,
            pendingOrdersLista.filter((o) => o.createdAt < cortes.olvidadoAntesDe).length,
          ] as const)
        : Promise.all([
            prisma.order.count({ where: PEDIDO_SIN_ATENDER }),
            prisma.order.count({
              where: { ...PEDIDO_SIN_ATENDER, createdAt: { gte: cortes.enCursoDesde } },
            }),
            prisma.order.count({
              where: { ...PEDIDO_SIN_ATENDER, createdAt: { lt: cortes.olvidadoAntesDe } },
            }),
          ]),
    ]);
    const itemsPorPedido = new Map(detalleRows.map((r) => [r.id, r.items]));
    const tenantMap = new Map<string, { name: string; slug: string }>();
    for (const t of tenants) {
      tenantMap.set(t.id, { name: t.name, slug: t.slug });
      tenantMap.set(t.slug, { name: t.name, slug: t.slug });
    }

    const atRiskRows = rescue.queue.filter(
      (r) => r.riskLevel === "critical" || r.riskLevel === "high",
    );
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
      supportCorrections: grupo(
        correcciones.count,
        "/superadmin/support?kind=correccion_guia",
        correcciones.filas.map((c) => ({
          id: c.id,
          categoria: "supportCorrections",
          ...nivelSolicitudCorreccion(c, ahora),
          title: `Guía ${c.guiaNumero}`,
          subtitle: `${ENTITY_TYPE_ETIQUETA[c.entityType]} · ${c.cambios.length} cambio${c.cambios.length === 1 ? "" : "s"} · pidió ${c.createdBy}`,
          tienda: c.tenantName || null,
          status: c.estado,
          createdAt: c.createdAt,
          href: `/superadmin/support?kind=correccion_guia&id=${encodeURIComponent(c.id)}`,
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
