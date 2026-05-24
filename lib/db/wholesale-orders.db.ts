import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * WholesaleOrdersDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/wholesale/orders.
 * Órdenes mayoristas B2B entre tenants (buyer↔seller con commissions).
 */

type ResolvedWholesaleItem = {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  appliedDiscount: number;
};

export const WholesaleOrdersDB = {
  /**
   * Lista órdenes donde el tenant es buyer o seller (cross-tenant intencional:
   * el caller puede ver tanto sus compras como sus ventas mayoristas).
   */
  async listForTenant(tenantId: string, take = 100) {
    return prisma.wholesaleOrder.findMany({
      where: {
        OR: [{ buyerTenantId: tenantId }, { sellerTenantId: tenantId }],
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  /**
   * Productos del seller (cross-tenant: buyer consulta nombres de productos
   * del seller). Scope vía productId — el catálogo del seller es público entre
   * tenants registrados.
   */
  async getProductNamesForSeller(sellerTenantId: string, productIds: number[]) {
    if (productIds.length === 0) return [];
    return prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: sellerTenantId },
      select: { id: true, name: true },
    });
  },

  async findSellerStore(sellerTenantId: string) {
    return prisma.store.findFirst({
      where: { tenantId: sellerTenantId },
      select: { id: true },
    });
  },

  async getStoreProductsWithTiers(storeId: string, productIds: number[]) {
    if (productIds.length === 0) return [];
    return prisma.storeProduct.findMany({
      where: { storeId, productId: { in: productIds } },
      select: { productId: true, volumePricingTiers: true },
    });
  },

  async createOrder(data: {
    buyerTenantId: string;
    sellerTenantId: string;
    total: number;
    commission: number;
    notes?: string;
    items: ResolvedWholesaleItem[];
  }) {
    // ADR-… P0 schema fix 2026-05-24: WholesaleOrder ahora requiere tenantId
    // (CONTRACT aplicado via MANUAL-p0-wholesale-order-tenantid-not-null.sql).
    // El vendedor es el dueño canónico del registro — cumple con multi-tenant
    // isolation guardrail: queries filtran por tenant del vendor (sellerTenantId).
    return prisma.wholesaleOrder.create({
      data: {
        tenantId: data.sellerTenantId,
        buyerTenantId: data.buyerTenantId,
        sellerTenantId: data.sellerTenantId,
        status: "pending",
        total: data.total,
        commission: data.commission,
        notes: data.notes,
        items: { create: data.items },
      },
      include: { items: true },
    });
  },
};
