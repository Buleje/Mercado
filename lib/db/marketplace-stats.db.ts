import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * MarketplaceStatsDB
 *
 * Agregados públicos cross-tenant para social proof en /marketplace.
 * Endpoint piloto: `/api/marketplace/stats/week`.
 *
 * Audit project-wide 2026-05-19 (CodeReview P0 #1): migración del
 * prisma.order.count + prisma.store.count directos a clase canónica.
 *
 * @cross-tenant intentional — endpoint público marketplace. Los conteos
 * son agregados globales por diseño (ADR-082). Solo agregados, nunca PII.
 */

export interface WeekStatsRow {
  deliveredOrders: number;
  activeStores: number;
}

export const MarketplaceStatsDB = {
  /**
   * Cuenta pedidos ENTREGADOS en los últimos N días (cross-tenant) +
   * total de tiendas publicadas. Devuelve null en cualquier fila si su
   * query falló — el caller decide cómo presentarlo.
   *
   * Si AMBAS queries fallan retornamos ceros para no romper la UI del
   * counter público.
   */
  async getRollingWindow(days = 7): Promise<WeekStatsRow> {
    const since = new Date(Date.now() - days * 86_400_000);
    const [deliveredOrders, activeStores] = await Promise.all([
      prisma.order
        .count({
          where: {
            status: "entregado",
            createdAt: { gte: since },
            deletedAt: null,
          },
        })
        .catch((err) => {
          logger.warn("[MarketplaceStatsDB.getRollingWindow] order count failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          return 0;
        }),
      prisma.store
        .count({
          where: { isPublished: true },
        })
        .catch((err) => {
          logger.warn("[MarketplaceStatsDB.getRollingWindow] store count failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          return 0;
        }),
    ]);
    return { deliveredOrders, activeStores };
  },
};
