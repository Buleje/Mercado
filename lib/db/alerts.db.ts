import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";

/**
 * lib/db/alerts.db.ts — Alertas agregadas del tenant para banners admin.
 *
 * Cubre el dashboard de alertas en el header admin:
 *   - solicitudesPendientes: DeliveryPartner pendiente de aprobación
 *   - pedidosSinPartner: orders confirmados/pendientes sin DeliveryAssignment
 *   - partnersOnline: count actual de partners activos en línea
 *   - recentExpiredOffers: ofertas que vencieron sin asignación (cascada agotada)
 *   - trialDaysLeft: días al fin del trial (si plan=free)
 *
 * Convenciones del proyecto respetadas:
 *   - tenantId 1er parámetro (CLAUDE.md regla #3)
 *   - getOrSet TTL 60s — banner se consulta en cada navegación del header,
 *     dedupe in-flight lleva cache hit >90%.
 *   - Promise.all paralelo (5 queries) — antes era serial fuera del all.
 *   - Sin `force-dynamic` — incompatible con cacheComponents en Next 16
 *     (ADR-019). Endpoint usa cookies via requireAdmin → Next infiere dynamic.
 */

export interface AlertsSummary {
  solicitudesPendientes: number;
  pedidosSinPartner: number;
  partnersOnline: number;
  recentExpiredOffers: number;
  trialDaysLeft: number | null;
}

export const AlertsDB = {
  async getSummary(tenantId: string): Promise<AlertsSummary> {
    return getOrSet(`admin:alerts-summary:${tenantId}`, 60, async () => {
      const [tenant, solicitudesPendientes, partnersOnline, recentExpired, pedidosSinPartner] = await Promise.all([
        prisma.tenant.findFirst({
          where: { OR: [{ id: tenantId }, { slug: tenantId }] },
          select: { plan: true, trialEndsAt: true },
        }),
        prisma.deliveryPartner.count({
          where: { tenantId, isActive: false },
        }),
        prisma.deliveryPartner.count({
          where: { tenantId, isOnline: true, isActive: true },
        }),
        prisma.deliveryOffer.count({
          where: {
            tenantId,
            status: "expired",
            respondedAt: null,
            offeredAt: { gt: new Date(Date.now() - 30 * 60_000) }, // últimos 30 min
          },
        }),
        // Pedidos confirmados sin assignment (heurística: customerLocation no vacío).
        prisma.order.count({
          where: {
            tenantId,
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
  },
};
