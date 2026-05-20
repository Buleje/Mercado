import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AdminSeedPeruProductsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/admin/seed-peru-products.
 * Seed de productos peruanos típicos para tenant "main".
 */

export interface SeedProductData {
  name: string;
  category: string;
  price: number;
  costPrice: number;
  unit: string;
  stock: number;
  stockMin: number;
  stockMax: number;
  description: string;
  image: string;
  barcode: string;
  badge?: string | null;
}

export const AdminSeedPeruProductsDB = {
  /**
   * Cuenta productos existentes del tenant (excluye soft-deleted).
   */
  async countExisting(tenantId: string): Promise<number> {
    return prisma.product.count({
      where: { tenantId, deletedAt: null },
    });
  },

  /**
   * Lookup por nombre exacto + tenantId para evitar duplicados.
   */
  async findByName(tenantId: string, name: string) {
    return prisma.product.findFirst({
      where: { tenantId, name, deletedAt: null },
    });
  },

  /**
   * Crea un producto con scope tenantId. active=true por defecto.
   */
  async create(tenantId: string, data: SeedProductData) {
    return prisma.product.create({
      data: {
        tenantId,
        name: data.name,
        category: data.category,
        price: data.price,
        costPrice: data.costPrice,
        unit: data.unit,
        stock: data.stock,
        stockMin: data.stockMin,
        stockMax: data.stockMax,
        description: data.description,
        image: data.image,
        barcode: data.barcode,
        badge: data.badge ?? null,
        active: true,
      },
    });
  },
};
