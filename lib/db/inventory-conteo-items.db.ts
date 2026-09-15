import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * InventoryConteoItemsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/inventory/conteo/[id]/items.
 * CRUD de items del conteo físico. tenantId verificado vía conteo.tenantId.
 */

export const InventoryConteoItemsDB = {
  async findConteoInTenant(tenantId: string, conteoId: string) {
    return prisma.conteoFisico.findFirst({
      where: { id: conteoId, tenantId },
    });
  },

  async listItemsByConteo(conteoId: string) {
    return prisma.conteoFisicoItem.findMany({
      where: { conteoId },
      orderBy: { id: "asc" },
    });
  },

  async getProductsForItems(tenantId: string, productIds: number[]) {
    if (productIds.length === 0) return [];
    return prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: {
        id: true,
        name: true,
        barcode: true,
        category: true,
        image: true,
        stock: true,
      },
    });
  },

  async findItemInConteo(itemId: string, conteoId: string) {
    return prisma.conteoFisicoItem.findFirst({
      where: { id: itemId, conteoId },
    });
  },

  /**
   * `stockContado` y `diferencia` son opcionales: se puede tildar o destildar
   * «ajustar» sin volver a contar el producto.
   */
  async updateItem(itemId: string, data: { stockContado?: number; diferencia?: number; ajustado: boolean }) {
    return prisma.conteoFisicoItem.update({
      where: { id: itemId },
      data,
    });
  },

  async markConteoInProgress(conteoId: string) {
    return prisma.conteoFisico.update({
      where: { id: conteoId },
      data: { status: "EN_PROGRESO" },
    });
  },
};
