import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/offers/[id]/accept
 *
 * El partner acepta la oferta. Validaciones:
 *   - oferta existe y pertenece al partner autenticado
 *   - status = "pending"
 *   - expiresAt > now
 *   - partner no tiene currentOrderId (no atiende otro pedido)
 *
 * Si todo OK:
 *   1. Marca oferta como accepted
 *   2. Cancela todas las otras offers pending del mismo orderId
 *   3. Crea DeliveryAssignment
 *   4. Actualiza partner.currentOrderId + acceptanceRate
 *
 * Race condition: 2 partners aceptan al mismo tiempo el mismo orderId
 * (escenarios cascada superpuesta). Resuelto con transaction y check
 * de assignment unique.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { id: offerId } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.deliveryOffer.findUnique({
        where: { id: offerId },
        select: {
          id: true, orderId: true, partnerId: true, status: true,
          expiresAt: true, feeOffered: true, distanceKm: true, tenantId: true,
        },
      });

      if (!offer) {
        return { error: "Oferta no encontrada", code: 404 };
      }
      if (offer.partnerId !== session.partnerId) {
        return { error: "Esta oferta no es para vos", code: 403 };
      }
      if (offer.status !== "pending") {
        return { error: `Oferta ya está en estado: ${offer.status}`, code: 409 };
      }
      if (offer.expiresAt.getTime() < Date.now()) {
        // Auto-marcar expired si aún figura pending tras vencer.
        await tx.deliveryOffer.update({
          where: { id: offerId },
          data: { status: "expired" },
        });
        return { error: "La oferta ya venció", code: 410 };
      }

      // Verificar que no haya assignment ya creado (otro partner ganó).
      const existingAssignment = await tx.deliveryAssignment.findUnique({
        where: { orderId: offer.orderId },
        select: { id: true },
      });
      if (existingAssignment) {
        await tx.deliveryOffer.update({
          where: { id: offerId },
          data: { status: "cancelled" },
        });
        return { error: "Otro repartidor ya tomó este pedido", code: 409 };
      }

      // Verificar que el partner no esté ocupado.
      const partner = await tx.deliveryPartner.findUnique({
        where: { id: session.partnerId },
        select: { currentOrderId: true, totalOffers: true, totalAccepted: true },
      });
      if (!partner) return { error: "Partner no existe", code: 404 };
      if (partner.currentOrderId) {
        return { error: "Ya estás atendiendo otro pedido", code: 409 };
      }

      // 1. Marcar oferta accepted.
      await tx.deliveryOffer.update({
        where: { id: offerId },
        data: { status: "accepted", respondedAt: new Date() },
      });

      // 2. Cancelar otras offers pending del mismo orderId.
      await tx.deliveryOffer.updateMany({
        where: { orderId: offer.orderId, status: "pending", id: { not: offerId } },
        data: { status: "cancelled" },
      });

      // 3. Crear assignment.
      await tx.deliveryAssignment.create({
        data: {
          orderId: offer.orderId,
          partnerId: session.partnerId,
          status: "assigned",
          fee: offer.feeOffered,
          tenantId: offer.tenantId,
        },
      });

      // 4. Actualizar partner.
      const newAccepted = (partner.totalAccepted ?? 0) + 1;
      const newOffers = Math.max(partner.totalOffers ?? 0, newAccepted);
      const newRate = newOffers > 0 ? newAccepted / newOffers : 1;
      await tx.deliveryPartner.update({
        where: { id: session.partnerId },
        data: {
          currentOrderId: offer.orderId,
          totalAccepted: newAccepted,
          acceptanceRate: newRate,
        },
      });

      return { ok: true, orderId: offer.orderId };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }

    logger.info("[delivery/offers/accept]", {
      partnerId: session.partnerId,
      offerId,
      orderId: result.orderId,
    });

    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    logger.error("[delivery/offers/accept] failed", { error: String(err), offerId });
    return NextResponse.json({ error: "Error al aceptar oferta" }, { status: 500 });
  }
}
