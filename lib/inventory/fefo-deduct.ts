import "server-only";
import { prisma } from "@/lib/prisma";
import { propagateExpiresAt } from "@/lib/db/batches.db";

// ── Tipos de resultado ───────────────────────────────────────────────────────

export type FEFODeductionDetail = {
  batchId: string;
  qty: number;
  expiryDate: Date;
};

export type FEFODeductionResult = {
  batches: FEFODeductionDetail[];
  /** Cantidad que no pudo cubrirse con lotes (si hay excedente) */
  unfulfilledQty: number;
};

/**
 * Descuenta stock usando FEFO (First Expired, First Out).
 *
 * Busca los lotes del producto ordenados por fecha de vencimiento ASC.
 * Descuenta del lote más cercano a vencer primero; si no alcanza,
 * pasa al siguiente lote.
 *
 * NO modifica Product.stock — esa responsabilidad queda en la capa
 * de ventas (transacción ACID del POS).
 *
 * @param tenantId - ID del tenant (obligatorio, primer parámetro)
 * @param productId - ID del producto
 * @param quantity - Cantidad a descontar
 * @returns Detalle de qué lotes se descontaron y cuánto de cada uno
 */
export async function deductStockFEFO(
  tenantId: string,
  productId: number,
  quantity: number,
): Promise<FEFODeductionResult> {
  // Ejecutar todo dentro de una transacción para garantizar atomicidad
  const result = await prisma.$transaction(async (tx) => {
    // Buscar lotes con stock disponible, ordenados FEFO (vencimiento más próximo primero)
    const batches = await tx.batch.findMany({
      where: {
        tenantId,
        productId,
        quantity: { gt: 0 },
      },
      orderBy: { expiryDate: "asc" },
    });

    let remaining = quantity;
    const deductions: FEFODeductionDetail[] = [];
    const updates: Array<{ id: string; newQty: number }> = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const toDeduct = Math.min(batch.quantity, remaining);
      deductions.push({
        batchId: batch.id,
        qty: toDeduct,
        expiryDate: batch.expiryDate,
      });
      updates.push({
        id: batch.id,
        newQty: batch.quantity - toDeduct,
      });
      remaining -= toDeduct;
    }

    // Aplicar las actualizaciones de lotes en paralelo dentro de la transacción
    if (updates.length > 0) {
      await Promise.all(
        updates.map((u) =>
          tx.batch.update({
            where: { id: u.id },
            data: { quantity: u.newQty },
          }),
        ),
      );
    }

    return {
      batches: deductions,
      unfulfilledQty: Math.max(0, remaining),
    };
  });

  // Propagar expiresAt al producto (fire-and-forget)
  propagateExpiresAt(productId).catch(() => {});

  return result;
}

/**
 * Verifica si un producto tiene lotes activos con stock.
 * Útil para decidir si aplicar FEFO o descuento normal.
 *
 * @param tenantId - ID del tenant (obligatorio, primer parámetro)
 * @param productId - ID del producto
 * @returns true si el producto tiene al menos un lote con stock > 0
 */
export async function hasBatchesWithStock(
  tenantId: string,
  productId: number,
): Promise<boolean> {
  const count = await prisma.batch.count({
    where: {
      tenantId,
      productId,
      quantity: { gt: 0 },
    },
  });
  return count > 0;
}
