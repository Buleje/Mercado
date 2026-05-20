import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * StockAlertsDB
 *
 * Helpers para crons de alertas de stock — cross-tenant (cada cron
 * corre 1 vez/dia para todo el ecosistema). Audit project-wide 2026-05-19
 * — migracion de /api/stock-alerts.
 *
 * @cross-tenant intentional — cron platform-wide (ADR-082).
 */

export interface LowStockProduct {
  id: number;
  name: string;
  stock: number | null;
  stockMin: number | null;
  category: string;
  unit: string;
  tenantId: string;
}

export interface VelocityCandidate {
  id: number;
  name: string;
  stock: number | null;
  stockMin: number | null;
  category: string;
  unit: string;
}

export const StockAlertsDB = {
  /**
   * Lista productos activos con stockMin definido. Caller filtra por
   * stock <= stockMin en memoria para no perder semantica null.
   */
  async listActiveWithMinStock(): Promise<LowStockProduct[]> {
    return prisma.product.findMany({
      where: {
        active: true,
        stock: { not: null },
        stockMin: { not: null },
      },
      select: {
        id: true,
        name: true,
        stock: true,
        stockMin: true,
        category: true,
        unit: true,
        tenantId: true,
      },
    });
  },

  /**
   * Lista productos activos con stock > 0 — candidatos para alerta
   * basada en velocidad de venta.
   */
  async listActiveWithStock(): Promise<VelocityCandidate[]> {
    return prisma.product.findMany({
      where: { active: true, stock: { not: null, gt: 0 } },
      select: {
        id: true,
        name: true,
        stock: true,
        stockMin: true,
        category: true,
        unit: true,
      },
    });
  },

  /**
   * Agrega movimientos de venta de las ultimas N dias por productId.
   * Devuelve Map<productId, dailyRate> (cantidad/N dias).
   */
  async getRecentSalesVelocity(days = 14): Promise<Map<number, number>> {
    const since = new Date(Date.now() - days * 86_400_000);
    const moves = await prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: { type: "venta", createdAt: { gte: since } },
      _sum: { quantity: true },
    });
    const map = new Map<number, number>();
    for (const m of moves) {
      map.set(m.productId, (m._sum.quantity ?? 0) / days);
    }
    return map;
  },
};
