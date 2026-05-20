import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsBasketDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/basket-analysis.
 * Análisis de market basket (apriori/associations) — la lógica de cálculo
 * (support, confidence, lift) queda en el route handler.
 */

export const AnalyticsBasketDB = {
  /**
   * Lista órdenes con items para market basket analysis.
   * Excluye órdenes canceladas.
   */
  async getOrdersWithItemsForBasket(tenantId: string, since: Date) {
    return prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        status: { not: "cancelado" },
      },
      select: {
        id: true,
        total: true,
        items: { select: { name: true } },
      },
    });
  },
};
