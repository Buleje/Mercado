import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { propagateExpiresAt } from "@/lib/db/batches.db";
import { logger } from "@/lib/logger";

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

      const batchQty = Number(batch.quantity);
      const toDeduct = Math.min(batchQty, remaining);
      deductions.push({
        batchId: batch.id,
        qty: toDeduct,
        expiryDate: batch.expiryDate,
      });
      updates.push({
        id: batch.id,
        newQty: batchQty - toDeduct,
      });
      remaining -= toDeduct;
    }

    // Aplicar updates: bulk UPDATE con CASE WHEN — 1 sola query en lugar
    // de N (perf fix Bug Hunter Report 2026-04-30).
    //
    // Para producto con 20 lotes: antes 1 findMany + 20 update = 21 queries
    // con N RTTs en serie dentro de la transacción (atomicidad de Prisma).
    // Ahora 1 findMany + 1 UPDATE = 2 queries (~10x menos round trips).
    if (updates.length === 1) {
      const u = updates[0];
      await tx.batch.update({
        where: { id: u.id },
        data: { quantity: u.newQty },
      });
    } else if (updates.length > 1) {
      const cases = Prisma.join(
        updates.map((u) => Prisma.sql`WHEN ${u.id} THEN ${u.newQty}::int`),
        " ",
      );
      const ids = Prisma.join(updates.map((u) => Prisma.sql`${u.id}`));
      await tx.$executeRaw`
        UPDATE "Batch"
           SET "quantity" = CASE "id" ${cases} END
         WHERE "id" IN (${ids})
           AND "tenantId" = ${tenantId}
      `;
    }

    return {
      batches: deductions,
      unfulfilledQty: Math.max(0, remaining),
    };
  });

  // Propagar expiresAt al producto (fire-and-forget).
  propagateExpiresAt(productId, tenantId).catch((err) =>
    logger.warn("[fefo-deduct] propagateExpiresAt failed", {
      productId,
      err: err instanceof Error ? err.message : String(err),
    }),
  );

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
