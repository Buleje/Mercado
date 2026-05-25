import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

/**
 * StatsLiveDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/stats/live.
 * Social proof cross-tenant para banners del marketplace/tienda
 * (ADR-082: cron platform-wide intentional).
 *
 * @cross-tenant intentional — solo retorna counts agregados, no PII.
 */
export const StatsLiveDB = {
  /**
   * Devuelve los 4 counts del social proof en paralelo.
   * Fail-open: cualquier query que falle devuelve 0 (no rompe UI).
   */
  async getLiveStats(): Promise<{
    activeStores: number;
    ordersLast24h: number;
    ordersLastHour: number;
    activeShoppers: number;
  }> {
    "use cache";
    cacheLife({ revalidate: 5, stale: 10 });
    cacheTag("platform:stats-live");
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since1h = new Date(now - 60 * 60 * 1000);

    const [activeStores, ordersLast24h, ordersLastHour, activeShoppers] = await Promise.all([
      prisma.store.count({ where: { isPublished: true } }).catch(() => 0),
      prisma.order.count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
      prisma.order.count({ where: { createdAt: { gte: since1h } } }).catch(() => 0),
      prisma.order
        .findMany({
          where: { createdAt: { gte: since24h } },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        })
        .then((rows) => rows.filter((r) => r.customerPhone).length)
        .catch(() => 0),
    ]);

    return { activeStores, ordersLast24h, ordersLastHour, activeShoppers };
  },
};
