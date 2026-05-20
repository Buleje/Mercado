import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * RecetasDetailDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/recetas/[id].
 * Operaciones de detalle/edición/soft-delete con ownership checks.
 */

export const RecetasDetailDB = {
  async countOwnedProducts(tenantId: string, productIds: number[]) {
    return prisma.product.count({
      where: { id: { in: productIds }, tenantId, deletedAt: null },
    });
  },

  async updateRecetaInTenant(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    return prisma.receta.updateMany({
      where: { id, tenantId },
      data,
    });
  },

  async findRecetaWithIngredientes(tenantId: string, id: string) {
    return prisma.receta.findFirst({
      where: { id, tenantId },
      include: { ingredientes: true },
    });
  },

  async replaceIngredientes(
    recetaId: string,
    ingredientes: Array<{ productoId: number; cantidad: number; unidad?: string }>,
  ) {
    // ingredientes scoped por recetaId del tenant (caller pre-valida ownership).
    /* eslint-disable no-restricted-syntax */
    await prisma.recetaIngrediente.deleteMany({ where: { recetaId } });
    if (ingredientes.length === 0) return;
    await prisma.recetaIngrediente.createMany({
      data: ingredientes.map((i) => ({
        recetaId,
        productoId: i.productoId,
        cantidad: i.cantidad,
        unidad: i.unidad ?? "unidad",
      })),
    });
    /* eslint-enable no-restricted-syntax */
  },

  async softDeleteReceta(tenantId: string, id: string) {
    return prisma.receta.updateMany({
      where: { id, tenantId },
      data: { activa: false },
    });
  },
};
