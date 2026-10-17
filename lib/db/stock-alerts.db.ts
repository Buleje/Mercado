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
  /** Para avisar a cada negocio sólo de lo suyo (09-10). */
  tenantId: string;
}

export const StockAlertsDB = {
  /**
   * Candidatos a «stock bajo»: activos, sin borrar y con stock controlado.
   * Los que tienen mínimo propio llegan ya en o bajo él; los que no, todos
   * (el caller los mide contra el mínimo global de SU negocio con
   * `enStockBajo`, 09-10: antes quedaban fuera y nunca alertaban).
   */
  async listActiveWithMinStock(): Promise<LowStockProduct[]> {
    return prisma.product.findMany({
      where: {
        active: true,
        deletedAt: null,
        stock: { not: null },
        OR: [
          { stockMin: { not: null }, stock: { lte: prisma.product.fields.stockMin } },
          { stockMin: null },
        ],
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
        tenantId: true,
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
