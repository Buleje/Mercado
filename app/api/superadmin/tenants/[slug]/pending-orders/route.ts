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
    const orders = await prisma.order.findMany({
      where: {
        tenantId: { in: [tenant.id, tenant.slug] },
        status: { in: PENDING_STATUSES as unknown as PendingStatus[] },
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        items: true,
        deliveryAssignment: {
          include: { partner: true },
        },
        deliveryOffers: {
          where: { status: "pending" },
          orderBy: { offeredAt: "desc" },
          take: 1,
          include: { partner: true },
        },
      },
    });

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
        delivery: o.deliveryAssignment
          ? {
              status: o.deliveryAssignment.status,
              partnerName: o.deliveryAssignment.partner.name,
              partnerPhone: o.deliveryAssignment.partner.phone,
              vehicleType: o.deliveryAssignment.partner.vehicleType,
              pickedUpAt: o.deliveryAssignment.pickedUpAt?.toISOString() ?? null,
            }
          : o.deliveryOffers[0]
            ? {
                status: "ofertando",
                partnerName: o.deliveryOffers[0].partner.name,
                partnerPhone: o.deliveryOffers[0].partner.phone,
                distanceKm: o.deliveryOffers[0].distanceKm,
                fee: Number(o.deliveryOffers[0].feeOffered),
                expiresAt: o.deliveryOffers[0].expiresAt.toISOString(),
                attempt: o.deliveryOffers[0].attempt,
              }
            : null,
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
    logger.error("[superadmin/tenants/pending-orders] failed", { error: String(err) });
    return NextResponse.json({ error: "Error al cargar pedidos" }, { status: 500 });
  }
}
