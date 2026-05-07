/**
 * Superadmin · Pedidos pendientes por tenant.
 *
 * GET /api/superadmin/tenants/[slug]/pending-orders
 *   - Lista los pedidos en status pendiente/preparando/asignado/en_camino
 *     del tenant indicado.
 *   - Incluye items, cliente, total, tiempo de espera, asignación delivery.
 *   - Ordenado por createdAt asc (los más viejos primero — los que más tiempo
 *     llevan esperando).
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Statuses considerados "no entregado" según el enum OrderStatus de Prisma:
// pendiente | confirmado | en_camino | entregado | cancelado.
const PENDING_STATUSES = ["pendiente", "confirmado", "en_camino"] as const;
type PendingStatus = (typeof PENDING_STATUSES)[number];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const { slug } = await params;

  // Buscamos el tenant por slug → cuid (porque Order.tenantId puede ser slug o cuid).
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, ownerPhone: true, ownerEmail: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

  try {
    // Query base SIN includes — robusto frente a schema drift (DeliveryAssignment
    // puede tener columnas pendientes de migración como routeStartedAt/proofPhotoUrl).
    const orders = await prisma.order.findMany({
      where: {
        tenantId: { in: [tenant.id, tenant.slug] },
        status: { in: PENDING_STATUSES as unknown as PendingStatus[] },
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: { items: true },
    });

    // Delivery info: best-effort. Si el schema de DeliveryAssignment/DeliveryOffer
    // está desincronizado vs DB (migration pendiente), seguimos respondiendo
    // con orders pero sin info de delivery.
    type AssignmentLite = {
      orderId: string;
      status: string;
      pickedUpAt: Date | null;
      partner: { name: string; phone: string; vehicleType: string };
    };
    type OfferLite = {
      orderId: string;
      distanceKm: number;
      feeOffered: unknown;
      expiresAt: Date;
      attempt: number;
      partner: { name: string; phone: string };
    };
    let assignments: AssignmentLite[] = [];
    let offers: OfferLite[] = [];
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      try {
        assignments = (await prisma.deliveryAssignment.findMany({
          where: { orderId: { in: orderIds } },
          select: {
            orderId: true,
            status: true,
            pickedUpAt: true,
            partner: { select: { name: true, phone: true, vehicleType: true } },
          },
        })) as AssignmentLite[];
      } catch (e) {
        logger.warn("[pending-orders] deliveryAssignment unavailable", { err: String(e) });
      }
      try {
        offers = (await prisma.deliveryOffer.findMany({
          where: { orderId: { in: orderIds }, status: "pending" },
          orderBy: { offeredAt: "desc" },
          select: {
            orderId: true,
            distanceKm: true,
            feeOffered: true,
            expiresAt: true,
            attempt: true,
            partner: { select: { name: true, phone: true } },
          },
        })) as OfferLite[];
      } catch (e) {
        logger.warn("[pending-orders] deliveryOffer unavailable", { err: String(e) });
      }
    }
    const assignmentMap = new Map<string, AssignmentLite>();
    for (const a of assignments) assignmentMap.set(a.orderId, a);
    const offerMap = new Map<string, OfferLite>();
    for (const o of offers) {
      if (!offerMap.has(o.orderId)) offerMap.set(o.orderId, o);
    }

    const enriched = orders.map((o) => {
      const itemsCount = o.items.reduce((acc, i) => acc + i.quantity, 0);
      const minutesWaiting = Math.floor(
        (Date.now() - new Date(o.createdAt).getTime()) / 60000,
      );
      return {
        id: o.id,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerLocation: o.customerLocation,
        customerReference: o.customerReference,
        total: Number(o.total),
        status: o.status,
        paymentMethod: o.paymentMethod,
        notes: o.notes,
        createdAt: o.createdAt.toISOString(),
        minutesWaiting,
        itemsCount,
        items: o.items.map((i) => ({
          id: i.id,
          name: i.name,
          price: Number(i.price),
          quantity: i.quantity,
          unit: i.unit,
          image: i.image,
        })),
        delivery: (() => {
          const a = assignmentMap.get(o.id);
          if (a) {
            return {
              status: a.status,
              partnerName: a.partner.name,
              partnerPhone: a.partner.phone,
              vehicleType: a.partner.vehicleType,
              pickedUpAt: a.pickedUpAt?.toISOString() ?? null,
            };
          }
          const off = offerMap.get(o.id);
          if (off) {
            return {
              status: "ofertando",
              partnerName: off.partner.name,
              partnerPhone: off.partner.phone,
              distanceKm: off.distanceKm,
              fee: Number(off.feeOffered),
              expiresAt: off.expiresAt.toISOString(),
              attempt: off.attempt,
            };
          }
          return null;
        })(),
      };
    });

    return NextResponse.json({
      tenant: {
        slug: tenant.slug,
        name: tenant.name,
        ownerPhone: tenant.ownerPhone,
        ownerEmail: tenant.ownerEmail,
      },
      orders: enriched,
      stats: {
        total: enriched.length,
        oldestMinutes: enriched[0]?.minutesWaiting ?? 0,
        sumTotal: enriched.reduce((acc, o) => acc + o.total, 0),
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    logger.error("[superadmin/tenants/pending-orders] failed", { error: detail });
    return NextResponse.json(
      {
        error: "Error al cargar pedidos",
        detail: process.env.NODE_ENV === "development" ? detail : undefined,
      },
      { status: 500 },
    );
  }
}
