import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * GET /api/delivery/me/offers
 *
 * Lista ofertas pending del partner autenticado. Filtra automáticamente
 * por expiresAt > now (descarta vencidas). El cron las marca expired.
 */
export async function GET(req: NextRequest) {
  try {
    // SECURITY 2026-05-06 (audit delivery #6): rate limit GENEROUS — la app
    // móvil hace polling normal pero queremos cap si partner se vuelve loco.
    const rl = applyRateLimit(req, "GENEROUS", "delivery-offers");
    if (rl) return rl;
    const session = await requirePartner(req);
    if (session instanceof NextResponse) return session;

    // Brandon mayo 2026 v7: además de las condiciones de pending+no expirada,
    // filtramos solo offers cuyo tenant tenga `useThirdPartyDelivery=true`. Si
    // el dueño del negocio desactivó la red Buleje, las offers existentes no
    // se sirven al rider (defensa en profundidad, además del filtro al crear).
    // Order no tiene relación nombrada con Tenant; hacemos 2 queries pequeñas.
    // Raw SQL: defensa contra cache del Prisma Client en dev tras migración.
    const enabledTenants = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Tenant" WHERE "useThirdPartyDelivery" = true
    `;
    const enabledTenantIds = enabledTenants.map((t) => t.id);
    if (enabledTenantIds.length === 0) {
      return NextResponse.json({ offers: [] });
    }

    const offers = await prisma.deliveryOffer.findMany({
      where: {
        partnerId: session.partnerId,
        status: "pending",
        expiresAt: { gt: new Date() },
        tenantId: { in: enabledTenantIds },
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

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
