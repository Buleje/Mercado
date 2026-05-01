import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/delivery/partners-live
 *
 * Devuelve los partners ONLINE del tenant con su última ubicación + offer
 * activa si la tiene + assignment en curso. Para mostrar en mapa admin.
 *
 * Filtra por tenantId del admin autenticado.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const partners = await prisma.deliveryPartner.findMany({
    where: {
      tenantId: auth.tenantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      vehicleType: true,
      isOnline: true,
      lat: true,
      lng: true,
      lastPingAt: true,
      currentOrderId: true,
      rating: true,
      acceptanceRate: true,
      assignments: {
        where: { status: { in: ["assigned", "picked_up", "in_transit"] } },
        select: {
          id: true,
          orderId: true,
          status: true,
          fee: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ isOnline: "desc" }, { name: "asc" }],
  });

  // Pending offers count por partner.
  const pendingOffers = await prisma.deliveryOffer.groupBy({
    by: ["partnerId"],
    where: {
      tenantId: auth.tenantId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    _count: { _all: true },
  });
  const pendingMap = new Map(pendingOffers.map((p) => [p.partnerId, p._count._all]));

  const enriched = partners.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    vehicleType: p.vehicleType,
    isOnline: p.isOnline,
    lat: p.lat,
    lng: p.lng,
    lastPingAt: p.lastPingAt,
    currentOrderId: p.currentOrderId,
    rating: p.rating,
    acceptanceRate: p.acceptanceRate,
    activeAssignment: p.assignments[0]
      ? {
          id: p.assignments[0].id,
          orderId: p.assignments[0].orderId,
          status: p.assignments[0].status,
          fee: Number(p.assignments[0].fee),
        }
      : null,
    pendingOffers: pendingMap.get(p.id) ?? 0,
  }));

  return NextResponse.json({
    partners: enriched,
    summary: {
      total: enriched.length,
      online: enriched.filter((p) => p.isOnline).length,
      withOffer: enriched.filter((p) => p.pendingOffers > 0).length,
      busy: enriched.filter((p) => p.currentOrderId != null).length,
    },
  });
}
