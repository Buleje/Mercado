import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * Audit project-wide 2026-05-19 — DB class para comparación de precios por proveedor.
 * Encapsula la query de historial de compras de un producto agrupado por supplierId.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbPrecioComparativoRow = {
  supplierId: string;
  supplierName: string;
  lastPrice: number;
  lastDate: string;
  purchaseCount: number;
  isCheapest: boolean;
};

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Obtiene comparación de precios de un producto entre todos sus proveedores.
 * Retorna el precio más reciente de cada proveedor + flag del más barato.
 */
export async function getComparativoPrecios(
  tenantId: string,
  productId: number,
): Promise<DbPrecioComparativoRow[]> {
  const items = await prisma.purchaseItem.findMany({
    where: {
      productId,
      purchaseOrder: { tenantId },
    },
    include: {
      purchaseOrder: {
        include: { supplier: true },
      },
    },
    orderBy: { purchaseOrder: { createdAt: "desc" } },
  });

  // Agrupar por supplierId, tomando el más reciente de cada uno
  const supplierMap = new Map<
    string,
    Omit<DbPrecioComparativoRow, "isCheapest">
  >();

  for (const item of items) {
    const sid = item.purchaseOrder.supplierId;
    const existing = supplierMap.get(sid);
    if (!existing) {
      supplierMap.set(sid, {
        supplierId: sid,
        supplierName: item.purchaseOrder.supplier?.name ?? item.purchaseOrder.supplierName,
        // TD-018: unitCost es Decimal
        lastPrice: toNumOrZero(item.unitCost),
        lastDate: item.purchaseOrder.createdAt.toISOString(),
        purchaseCount: 1,
      });
    } else {
      existing.purchaseCount++;
    }
  }

  const comparaciones = Array.from(supplierMap.values());
  const minPrice =
    comparaciones.length > 0 ? Math.min(...comparaciones.map((c) => c.lastPrice)) : 0;

  return comparaciones.map((c) => ({
    ...c,
    isCheapest: c.lastPrice === minPrice,
  }));
}
