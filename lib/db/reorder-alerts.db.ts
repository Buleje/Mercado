import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ReorderAlertsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/reorder-alerts.
 * Auto-creación de purchase orders draft cuando productos bajan
 * de stockMin. Cross-tenant (cron de plataforma ADR-082).
 */

export const ReorderAlertsDB = {
  /**
   * Lista productos activos con stockMin definido — base del filtro
   * "low stock" hecho en memoria por el caller.
   *
   * @cross-tenant intentional — cron platform-wide.
   */
  async listProductsWithMinStock() {
    return prisma.product.findMany({
      where: { active: true, stock: { not: null }, stockMin: { not: null } },
      select: { id: true, name: true, stock: true, stockMin: true, stockMax: true, category: true, unit: true },
    });
  },

  /**
   * Lookup del último supplier para cada productId (cross-tenant).
   * Usa el historial de PurchaseItem + PurchaseOrder.supplierName.
   */
  async getRecentSuppliersForProducts(productIds: number[]) {
    if (productIds.length === 0) return [];
    return prisma.purchaseItem.findMany({
      where: { productId: { in: productIds } },
      include: { purchaseOrder: { select: { supplierName: true } } },
      orderBy: { purchaseOrder: { createdAt: "desc" } },
    });
  },

  /**
   * Lookup de supplier por nombre — usado por cron para asociar
   * los purchase orders auto-generados.
   *
   * @cross-tenant intentional — cron platform-wide.
   */
  async findSupplierByName(name: string) {
    return prisma.supplier.findFirst({
      where: { name },
      select: { id: true, tenantId: true },
    });
  },

  /**
   * Crea un purchase order draft con items. Usado por el cron
   * para auto-generar PO cuando se detecta stock bajo. tenantId
   * viene del supplier que se encontró previamente.
   */
  async createDraftPurchaseOrder(data: {
    poId: string;
    tenantId: string;
    supplierId: string;
    supplierName: string;
    total: number;
    notes: string;
    items: Array<{
      productId: number;
      name: string;
      quantity: number;
      unitCost: number;
      unit: string;
    }>;
  }) {
    return prisma.purchaseOrder.create({
      data: {
        id: data.poId,
        tenantId: data.tenantId,
        supplierId: data.supplierId,
        supplierName: data.supplierName,
        total: data.total,
        status: "pendiente",
        notes: data.notes,
        items: {
          create: data.items,
        },
      },
    });
  },
};
