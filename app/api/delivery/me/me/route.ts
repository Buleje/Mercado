import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { logger } from "@/lib/logger";

/**
 * GET /api/delivery/me/me
 * Devuelve el perfil + stats del partner autenticado.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePartner(req);
    if (session instanceof NextResponse) return session;

    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: session.partnerId },
      select: {
        id: true, name: true, phone: true, email: true, zone: true,
        vehicleType: true, isActive: true, isOnline: true, rating: true,
        acceptanceRate: true, totalOffers: true, totalAccepted: true,
        currentOrderId: true, lat: true, lng: true, lastPingAt: true,
        maxRadiusKm: true,
      },
    });

    if (!partner) {
      return NextResponse.json({ error: "Partner no existe" }, { status: 404 });
    }

    return NextResponse.json({ partner });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
