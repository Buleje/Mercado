import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";

// Brandon 2026-05-16 (audit P1):
//  - force-dynamic obligatorio (depende de cookies via requireAdmin).
//  - getOrSet TTL 60s — el banner llama este endpoint en cada navegación
//    y polling del header. Sin cache, eran 5 queries/llamada (1 tenant + 4
//    aggregates). Con TTL 60s + dedupe in-flight, cache hit >90%.
//  - Promise.all para pedidosSinPartner (antes era query serial fuera del
//    Promise.all → 5 queries en cascada).
export const dynamic = "force-dynamic";

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

  const payload = await getOrSet(`admin:alerts-summary:${auth.tenantId}`, 60, async () => {
    const [tenant, solicitudesPendientes, partnersOnline, recentExpired, pedidosSinPartner] = await Promise.all([
      prisma.tenant.findFirst({
        where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
        select: { plan: true, trialEndsAt: true },
      }),
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
      // Pedidos confirmados sin assignment (heurística: customerLocation no vacío).
      prisma.order.count({
        where: {
          tenantId: auth.tenantId,
          status: { in: ["confirmado", "pendiente"] },
          deliveryAssignment: null,
          customerLocation: { not: "" },
          createdAt: { gt: new Date(Date.now() - 60 * 60_000) },
        },
      }),
    ]);

    const trialDaysLeft = (() => {
      if (!tenant?.trialEndsAt) return null;
      if (tenant.plan && tenant.plan !== "free") return null;
      return Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000));
    })();

    return {
      solicitudesPendientes,
      pedidosSinPartner,
      partnersOnline,
      recentExpiredOffers: recentExpired,
      trialDaysLeft,
    };
  });

  return NextResponse.json(payload);
}
