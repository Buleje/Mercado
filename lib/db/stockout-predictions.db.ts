/**
 * lib/db/stockout-predictions.db.ts
 *
 * DB class para StockoutPrediction (Marketplace Bloque C — Feature C1).
 * Predice cuándo un producto se va a agotar basándose en promedio de venta histórica
 * (últimos 30 días) y stock actual.
 *
 * Schema notas:
 * - Order NO tiene storeId. Las orders del marketplace se asocian a stores via
 *   OrderItem.productId → Product.storeProducts → Store.
 * - Stock vive en Product.stock (Int?). StoreProduct sólo tiene precios.
 * - StoreProduct usa isActive (no isPublished).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix, getOrSet } from "@/lib/cache";
import type { StockoutPrediction as PStockoutPrediction } from "@/lib/generated/prisma/client";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type StockoutSeverity = "low" | "medium" | "high" | "critical";

export type DbStockoutPrediction = {
  id: string;
  tenantId: string;
  storeId: string;
  productId: number;
  storeProductId: string;
  predictedDaysToStockout: number;
  avgDailyUnits: number;
  currentStock: number;
  confidence: number;
  severity: StockoutSeverity;
  computedAt: string;
  expiresAt: string;
};

function mapStockoutPrediction(row: PStockoutPrediction): DbStockoutPrediction {
  return {
    id: row.id,
    tenantId: row.tenantId,
    storeId: row.storeId,
    productId: row.productId,
    storeProductId: row.storeProductId,
    predictedDaysToStockout: row.predictedDaysToStockout,
    avgDailyUnits: row.avgDailyUnits,
    currentStock: row.currentStock,
    confidence: row.confidence,
    severity: row.severity as StockoutSeverity,
    computedAt: row.computedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function calculateSeverity(daysToStockout: number): StockoutSeverity {
  if (daysToStockout < 2) return "critical";
  if (daysToStockout < 4) return "high";
  if (daysToStockout < 7) return "medium";
  return "low";
}

function calculateConfidence(salesDatapoints: number): number {
  if (salesDatapoints >= 10) return 0.9;
  if (salesDatapoints >= 5) return 0.7;
  if (salesDatapoints >= 1) return 0.5;
  return 0.0;
}

export const StockoutPredictionsDB = {
  /**
   * Compute predictions for one store. Borra las predicciones anteriores del store
   * y crea nuevas. Devuelve la cantidad creada.
   */
  async compute(tenantId: string, storeId: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await prisma.stockoutPrediction.deleteMany({
      where: { tenantId, storeId },
    });

    // Productos activos publicados en la store, junto con stock real desde Product
    const storeProducts = await prisma.storeProduct.findMany({
      where: {
        store: { tenantId, id: storeId },
        isActive: true,
      },
      select: {
        id: true,
        productId: true,
        product: {
          select: { id: true, stock: true },
        },
      },
    });

    if (storeProducts.length === 0) return 0;

    // Round 7 fix: 1 groupBy con IN (...) en lugar de N aggregates en loop.
    // Antes: 1 query por storeProduct (N+1 garantizado para stores con 100+ productos).
    const productIds = storeProducts.map((sp) => sp.productId);
    const salesByProduct = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        order: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      _sum: { quantity: true },
      _count: { _all: true },
    });

    const salesMap = new Map<number, { totalUnits: number; datapoints: number }>();
    for (const row of salesByProduct) {
      if (row.productId == null) continue;
      salesMap.set(row.productId, {
        totalUnits: row._sum.quantity ?? 0,
        datapoints: row._count._all,
      });
    }

    const predictionsToCreate: Array<{
      tenantId: string;
      storeId: string;
      productId: number;
      storeProductId: string;
      predictedDaysToStockout: number;
      avgDailyUnits: number;
      currentStock: number;
      confidence: number;
      severity: string;
      computedAt: Date;
      expiresAt: Date;
    }> = [];

    for (const sp of storeProducts) {
      const stock = sp.product?.stock ?? 0;
      const sales = salesMap.get(sp.productId);
      const totalUnitsSold = sales?.totalUnits ?? 0;
      const datapoints = sales?.datapoints ?? 0;
      const avgDailyUnits = datapoints > 0 ? totalUnitsSold / 30 : 0;

      if (datapoints < 1 || avgDailyUnits <= 0) continue;

      const predictedDays = stock / avgDailyUnits;
      const severity = calculateSeverity(predictedDays);
      const confidence = calculateConfidence(datapoints);
      const now = new Date();

      predictionsToCreate.push({
        tenantId,
        storeId,
        productId: sp.productId,
        storeProductId: sp.id,
        predictedDaysToStockout: predictedDays,
        avgDailyUnits,
        currentStock: stock,
        confidence,
        severity,
        computedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
    }

    if (predictionsToCreate.length > 0) {
      await prisma.stockoutPrediction.createMany({ data: predictionsToCreate });
    }

    invalidateByPrefix(`stockout-predictions:${tenantId}:${storeId}`);
    return predictionsToCreate.length;
  },

  async getByStore(
    tenantId: string,
    storeId: string,
    opts?: {
      severity?: StockoutSeverity[];
      limit?: number;
    },
  ): Promise<DbStockoutPrediction[]> {
    const sevKey = opts?.severity?.slice().sort().join(",") ?? "all";
    const limitKey = opts?.limit ?? 100;
    const cacheKey = `stockout-predictions:${tenantId}:${storeId}:${sevKey}:${limitKey}`;

    return getOrSet(cacheKey, 3600, async () => {
      const now = new Date();
      const rows = await prisma.stockoutPrediction.findMany({
        where: {
          tenantId,
          storeId,
          expiresAt: { gt: now },
          ...(opts?.severity && { severity: { in: opts.severity } }),
        },
        orderBy: [{ severity: "desc" }, { predictedDaysToStockout: "asc" }],
        take: opts?.limit ?? 100,
      });
      return rows.map(mapStockoutPrediction);
    });
  },

  async getCriticalForVendor(
    tenantId: string,
    storeId: string,
  ): Promise<DbStockoutPrediction[]> {
    return this.getByStore(tenantId, storeId, {
      severity: ["critical", "high"],
      limit: 50,
    });
  },

  /** Borra predicciones expiradas. Llamado por el cron. */
  async cleanup(tenantId: string): Promise<number> {
    const result = await prisma.stockoutPrediction.deleteMany({
      where: {
        tenantId,
        expiresAt: { lte: new Date() },
      },
    });
    invalidateByPrefix(`stockout-predictions:${tenantId}:`);
    return result.count;
  },
};
