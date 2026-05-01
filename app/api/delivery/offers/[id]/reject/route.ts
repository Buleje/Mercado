import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/offers/[id]/reject
 *
 * El partner rechaza la oferta. Marca la offer como rejected y dispara
 * la cascada (creando offer al siguiente partner) — esto lo hace el cron
 * delivery-offer-cascade en el próximo tick (max 30s después).
 *
 * Reduce ligeramente el acceptanceRate del partner (anti-gaming).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { id: offerId } = await params;

  const offer = await prisma.deliveryOffer.findUnique({
    where: { id: offerId },
    select: { id: true, partnerId: true, status: true },
  });

  if (!offer) {
    return NextResponse.json({ error: "Oferta no encontrada" }, { status: 404 });
  }
  if (offer.partnerId !== session.partnerId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (offer.status !== "pending") {
    return NextResponse.json(
      { error: `Oferta ya está en estado: ${offer.status}` },
      { status: 409 },
    );
  }

  await prisma.deliveryOffer.update({
    where: { id: offerId },
    data: { status: "rejected", respondedAt: new Date() },
  });

  // Penalty mínimo en acceptanceRate (rejected cuenta como offer no tomada).
  const partner = await prisma.deliveryPartner.findUnique({
    where: { id: session.partnerId },
    select: { totalOffers: true, totalAccepted: true },
  });
  if (partner) {
    const newOffers = (partner.totalOffers ?? 0) + 1;
    const newRate = newOffers > 0 ? (partner.totalAccepted ?? 0) / newOffers : 1;
    await prisma.deliveryPartner.update({
      where: { id: session.partnerId },
      data: { totalOffers: newOffers, acceptanceRate: newRate },
    });
  }

  logger.info("[delivery/offers/reject]", { partnerId: session.partnerId, offerId });
  return NextResponse.json({ ok: true });
}
