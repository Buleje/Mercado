import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { withDbRetry } from "@/lib/db-retry";

/**
 * AnalyticsKpisDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/kpis.
 * Wrapper sobre 9 queries paralelas + cache:
 *  - 4 sale.aggregate (hoy/ayer/mes/mes-ant)
 *  - 3 saleItem.findMany (costos: hoy/mes/mes-ant — via sale.tenantId nested)
 *  - 1 fiado.aggregate
 *  - 1 product.findMany (stock crítico)
 */

export interface KpiDateRanges {
  todayStart: Date;
  yesterdayStart: Date;
  yesterdayEnd: Date;
  thisMonthStart: Date;
  lastMonthStart: Date;
  lastMonthEnd: Date;
}

export const AnalyticsKpisDB = {
  /**
   * Devuelve los 9 raw results en paralelo con withDbRetry.
   * Los cálculos de margen, pct change y stock crítico quedan en el route.
   */
  async fetchKpisRaw(tenantId: string, r: KpiDateRanges) {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:kpis`);
    const tenantFilter = { tenantId };

    return withDbRetry(() =>
      Promise.all([
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: r.todayStart } },
          _sum: { total: true },
          _count: { id: true },
        }),
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: r.yesterdayStart, lt: r.yesterdayEnd } },
          _sum: { total: true },
          _count: { id: true },
        }),
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: r.thisMonthStart } },
          _sum: { total: true },
          _count: { id: true },
        }),
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: r.lastMonthStart, lt: r.lastMonthEnd } },
          _sum: { total: true },
          _count: { id: true },
        }),
        prisma.saleItem.findMany({
          where: { sale: { ...tenantFilter, createdAt: { gte: r.todayStart } } },
          select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
        }),
        prisma.saleItem.findMany({
          where: { sale: { ...tenantFilter, createdAt: { gte: r.thisMonthStart } } },
          select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
        }),
        prisma.saleItem.findMany({
          where: { sale: { ...tenantFilter, createdAt: { gte: r.lastMonthStart, lt: r.lastMonthEnd } } },
          select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
        }),
        prisma.fiado.aggregate({
          where: { ...tenantFilter, status: "ACTIVO" },
          _sum: { saldo: true },
          _count: { id: true },
        }),
        prisma.product.findMany({
          where: {
            ...tenantFilter,
            active: true,
            deletedAt: null,
            stockMin: { not: null },
            stock: { not: null },
          },
          select: { stock: true, stockMin: true },
        }),
      ]),
    );
  },
};
