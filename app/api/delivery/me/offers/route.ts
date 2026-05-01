import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";

/**
 * GET /api/delivery/me/offers
 *
 * Lista ofertas pending del partner autenticado. Filtra automáticamente
 * por expiresAt > now (descarta vencidas). El cron las marca expired.
 */
export async function GET(req: NextRequest) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const offers = await prisma.deliveryOffer.findMany({
    where: {
      partnerId: session.partnerId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    orderBy: { offeredAt: "desc" },
    select: {
      id: true,
      orderId: true,
      status: true,
      offeredAt: true,
      expiresAt: true,
      distanceKm: true,
      feeOffered: true,
      attempt: true,
      order: {
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          customerLocation: true,
          customerReference: true,
          total: true,
          notes: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    offers: offers.map((o) => ({
      ...o,
      feeOffered: Number(o.feeOffered),
      // Total y otros decimals serializados a number para el cliente.
      order: { ...o.order, total: Number(o.order.total) },
    })),
  });
}
