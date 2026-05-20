/**
 * lib/db/abandoned-cart-stats.db.ts
 *
 * Consultas para estadísticas de carritos abandonados.
 * tenantId es siempre el primer argumento (multi-tenant isolation — CLAUDE.md regla #3).
 *
 * Audit project-wide 2026-05-19: migración de prisma directo a DB class.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface AbandonedCartStatsResult {
  count: number;
  estimatedValue: number;
}

// ── AbandonedCartStatsDB ───────────────────────────────────────────────────────

export const AbandonedCartStatsDB = {
  /**
   * Retorna conteo y valor estimado de carritos abandonados.
   * "Abandonado" = actualizado hace más de `minAgeMs` ms y menos de `maxAgeMs` ms,
   * con ítems no vacíos.
   *
   * @param tenantId  - Tenant isolado (obligatorio)
   * @param minAgeMs  - Mínimo tiempo de inactividad en ms (default: 2h)
   * @param maxAgeMs  - Máximo tiempo de inactividad en ms (default: 24h)
   */
  async getStats(
    tenantId: string,
    minAgeMs = 2 * 60 * 60 * 1000,
    maxAgeMs = 24 * 60 * 60 * 1000,
  ): Promise<AbandonedCartStatsResult> {
    const now = Date.now();
    const cutoff = new Date(now - minAgeMs);
    const maxAge = new Date(now - maxAgeMs);

    let carts: { itemsJson: string }[] = [];
    try {
      carts = await prisma.savedCart.findMany({
        where: {
          tenantId,
          updatedAt: { lt: cutoff, gt: maxAge },
          NOT: { itemsJson: "[]" },
        },
        select: { itemsJson: true },
      });
    } catch (err) {
      logger.error("AbandonedCartStatsDB.getStats: query failed", {
        err: err instanceof Error ? err.message : String(err),
        tenantId,
      });
      throw err;
    }

    let count = 0;
    let estimatedValue = 0;

    for (const cart of carts) {
      try {
        const items = JSON.parse(cart.itemsJson);
        if (!Array.isArray(items) || items.length === 0) continue;
        count++;
        for (const item of items) {
          const qty = item.qty ?? item.quantity ?? 1;
          const price = typeof item.price === "number" ? item.price : 0;
          estimatedValue += price * qty;
        }
      } catch {
        // JSON inválido — skip silencioso
      }
    }

    return {
      count,
      estimatedValue: Math.round(estimatedValue * 100) / 100,
    };
  },
};
