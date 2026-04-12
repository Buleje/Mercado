import "server-only";
import { prisma } from "@/lib/prisma";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type StockAlert = {
  productId: number;
  productName: string;
  currentStock: number;
  avgDailySales: number;
  daysUntilStockout: number;
  reorderQuantity: number;
  urgency: "critico" | "urgente"; // <3 días → critico, <7 → urgente
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 30;
const ALERT_THRESHOLD_DAYS = 7;
const REORDER_COVERAGE_DAYS = 14;

/**
 * Calcula cuántos días quedan antes de que se agote el stock de un producto,
 * basándose en la velocidad de ventas promedio de los últimos 30 días.
 *
 * Retorna Infinity si no hubo ventas (no hay riesgo de agotamiento inmediato).
 */
export async function calculateDaysUntilStockout(
  tenantId: string,
  productId: number,
): Promise<{ daysUntilStockout: number; avgDailySales: number }> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  // Agregamos la cantidad total vendida del producto en los últimos 30 días.
  // SaleItem no tiene tenantId propio; lo filtramos vía Sale.tenantId.
  const result = await prisma.saleItem.aggregate({
    _sum: { quantity: true },
    where: {
      productId,
      sale: {
        tenantId,
        createdAt: { gte: since },
      },
    },
  });

  const totalSold = result._sum.quantity ?? 0;
  const avgDailySales = totalSold / LOOKBACK_DAYS;

  if (avgDailySales === 0) {
    return { daysUntilStockout: Infinity, avgDailySales: 0 };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId, deletedAt: null },
    select: { stock: true },
  });

  const currentStock = product?.stock ?? 0;

  if (currentStock <= 0) {
    return { daysUntilStockout: 0, avgDailySales };
  }

  const daysUntilStockout = currentStock / avgDailySales;
  return { daysUntilStockout, avgDailySales };
}

/**
 * Retorna todos los productos con stock en riesgo (< 7 días hasta agotarse),
 * ordenados de más urgente a menos urgente.
 */
export async function getReorderAlerts(tenantId: string): Promise<StockAlert[]> {
  // Traemos productos activos con stock definido
  const products = await prisma.product.findMany({
    where: {
      tenantId,
      deletedAt: null,
      active: true,
      stock: { not: null },
    },
    select: { id: true, name: true, stock: true },
  });

  const alerts: StockAlert[] = [];

  for (const product of products) {
    const { daysUntilStockout, avgDailySales } = await calculateDaysUntilStockout(
      tenantId,
      product.id,
    );

    if (daysUntilStockout < ALERT_THRESHOLD_DAYS) {
      const currentStock = product.stock ?? 0;
      const reorderQuantity = generateReorderSuggestion({
        avgDailySales,
        currentStock,
      });

      alerts.push({
        productId: product.id,
        productName: product.name,
        currentStock,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        daysUntilStockout: Math.round(daysUntilStockout * 10) / 10,
        reorderQuantity,
        urgency: daysUntilStockout < 3 ? "critico" : "urgente",
      });
    }
  }

  // Ordenar: primero los más críticos (menos días)
  alerts.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);

  return alerts;
}

/**
 * Calcula la cantidad sugerida de reorden para cubrir 14 días de ventas
 * descontando el stock actual.
 * Retorna mínimo 1 si hay algo que reponer.
 */
export function generateReorderSuggestion({
  avgDailySales,
  currentStock,
}: {
  avgDailySales: number;
  currentStock: number;
}): number {
  const needed = avgDailySales * REORDER_COVERAGE_DAYS - currentStock;
  return needed > 0 ? Math.ceil(needed) : 1;
}
