import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/alerts-summary
 *
 * Resumen de alertas del tenant para el banner admin:
 *   - solicitudesPendientes: DeliveryPartner con isActive=false (esperando aprobación)
 *   - pedidosSinPartner: orders confirmados sin DeliveryAssignment
 *   - trialEnDias: días que faltan al trial (si plan=free)
 *   - partnersOnline: count actual
 *   - offersExpiradas: offers que vencieron sin asignación (cascada agotada)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    select: { plan: true, trialEndsAt: true },
  });

  const trialDaysLeft = (() => {
    if (!tenant?.trialEndsAt) return null;
    if (tenant.plan && tenant.plan !== "free") return null;
    return Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000));
  })();

  const [solicitudesPendientes, partnersOnline, recentExpired] = await Promise.all([
    prisma.deliveryPartner.count({
      where: { tenantId: auth.tenantId, isActive: false },
    }),
    prisma.deliveryPartner.count({
      where: { tenantId: auth.tenantId, isOnline: true, isActive: true },
    }),
    prisma.deliveryOffer.count({
      where: {
        tenantId: auth.tenantId,
        status: "expired",
        respondedAt: null,
        offeredAt: { gt: new Date(Date.now() - 30 * 60_000) }, // últimos 30 min
      },
    }),
  ]);

  // Pedidos confirmados sin assignment (heurística: customerLocation no vacío).
  const pedidosSinPartner = await prisma.order.count({
    where: {
      tenantId: auth.tenantId,
      status: { in: ["confirmado", "pendiente"] },
      deliveryAssignment: null,
      customerLocation: { not: "" },
      createdAt: { gt: new Date(Date.now() - 60 * 60_000) },
    },
  });

  return NextResponse.json({
    solicitudesPendientes,
    pedidosSinPartner,
    partnersOnline,
    recentExpiredOffers: recentExpired,
    trialDaysLeft,
  });
}
