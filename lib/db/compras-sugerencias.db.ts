import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * Audit project-wide 2026-05-19 — DB class para sugerencias de reabastecimiento.
 * Encapsula las 3 queries que calculan urgencia de compra por producto activo.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbSugerenciaProduct = {
  id: number;
  name: string;
  category: string | null;
  stock: number | null;
  stockMin: number | null;
  stockMax: number | null;
};

export type DbSugerenciaLastPurchase = {
  supplierId: string;
  supplierName: string;
  lastPrice: number;
};

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Obtiene todos los productos activos con stockMin > 0 para el tenant.
 */
export async function getProductosConStockMin(
  tenantId: string,
): Promise<DbSugerenciaProduct[]> {
  return prisma.product.findMany({
    where: { tenantId, active: true, deletedAt: null, stockMin: { gt: 0 } },
    select: { id: true, name: true, category: true, stock: true, stockMin: true, stockMax: true },
  });
}

/**
 * Agrega ventas de los últimos 30 días por productId (para calcular daily avg).
 */
export async function getVentasPor30Dias(
  tenantId: string,
  productIds: number[],
  since: Date,
): Promise<Map<number, number>> {
  const salesAgg = await prisma.saleItem.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
    where: {
      productId: { in: productIds },
      sale: { tenantId, createdAt: { gte: since } },
    },
  });

  const map = new Map<number, number>();
  for (const row of salesAgg) {
    map.set(row.productId, (row._sum.quantity ?? 0) / 30);
  }
  return map;
}

/**
 * Obtiene la última compra por producto para extraer proveedor y precio sugerido.
 * Degrada graceful si hay schema drift en PurchaseItem (retorna Map vacío).
 */
export async function getUltimaCompraPorProducto(
  tenantId: string,
  productIds: number[],
): Promise<Map<number, DbSugerenciaLastPurchase>> {
  const map = new Map<number, DbSugerenciaLastPurchase>();
  try {
    const lastPurchases = await prisma.purchaseItem.findMany({
      where: { productId: { in: productIds }, purchaseOrder: { tenantId } },
      include: { purchaseOrder: { include: { supplier: true } } },
      orderBy: { purchaseOrder: { createdAt: "desc" } },
    });

    for (const pi of lastPurchases) {
      if (!map.has(pi.productId)) {
        map.set(pi.productId, {
          supplierId: pi.purchaseOrder.supplierId,
          supplierName: pi.purchaseOrder.supplier?.name ?? pi.purchaseOrder.supplierName,
          // TD-018: unitCost es Decimal
          lastPrice: toNumOrZero(pi.unitCost),
        });
      }
    }
  } catch (e) {
    // Schema drift en PurchaseItem (CLAUDE.md regla 14) — degrada graceful:
    // calcula sugerencias sin info de proveedor anterior. Mejor que 500.
    logger.warn("[compras-sugerencias.db] purchaseItem query failed (schema drift)", {
      err: e instanceof Error ? e.message : String(e),
    });
  }
  return map;
}
