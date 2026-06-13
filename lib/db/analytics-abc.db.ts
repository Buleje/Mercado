import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * lib/db/analytics-abc.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de prisma directo a DB class.
 * ABC classification: extrae items de venta (POS + online) por tenant para
 * que el route handler calcule el scoring acumulativo A/B/C por revenue.
 *
 * SECURITY FIX: el endpoint original no filtraba por tenantId en saleItem ni
 * en orderItem — data leak cross-tenant. Aquí ambas queries scopean por tenantId
 * via relación con Sale/Order respectivamente.
 *
 * Todas las queries scopean por tenantId (regla #3 CLAUDE.md).
 */

export type ABCSaleItemRaw = {
  productId: number;
  price: number;
  quantity: number;
};

export type ABCOrderItemRaw = {
  productId: number | null;
  price: number;
  quantity: number;
};

export type ABCProductMeta = {
  id: number;
  name: string;
  category: string | null;
};

export const AnalyticsABCDB = {
  /**
   * Obtiene todos los items de ventas POS del tenant con precio y cantidad.
   * Filtra por tenantId via relación Sale → tenantId.
   * @param tenantId — Scope multi-tenant obligatorio.
   */
  async getSaleItemsForABC(tenantId: string): Promise<ABCSaleItemRaw[]> {
    const rows = await prisma.saleItem.findMany({
      where: { sale: { tenantId } },
      select: { productId: true, price: true, quantity: true },
      // Cap defensivo (Brandon 2026-06-13, audit perf): evita OOM si el tenant
      // acumula cientos de miles de SaleItem. 50k cubre el análisis ABC real.
      orderBy: { id: "desc" },
      take: 50_000,
    });

    return rows.map((r) => ({
      productId: r.productId,
      price: Number(r.price),
      quantity: r.quantity,
    }));
  },

  /**
   * Obtiene items de órdenes online (no canceladas) del tenant.
   * Filtra por tenantId via relación Order → tenantId.
   * @param tenantId — Scope multi-tenant obligatorio.
   */
  async getOrderItemsForABC(tenantId: string): Promise<ABCOrderItemRaw[]> {
    const rows = await prisma.orderItem.findMany({
      where: {
        productId: { not: null },
        order: { tenantId, status: { not: "cancelado" } },
      },
      select: { productId: true, price: true, quantity: true },
    });

    return rows.map((r) => ({
      productId: r.productId,
      price: Number(r.price),
      quantity: r.quantity,
    }));
  },

  /**
   * Carga metadata de productos (nombre y categoría) para enriquecer resultados.
   * @param tenantId    — Scope multi-tenant obligatorio.
   * @param productIds  — IDs de productos a consultar.
   */
  async getProductMetaForABC(
    tenantId: string,
    productIds: number[]
  ): Promise<ABCProductMeta[]> {
    return prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: { id: true, name: true, category: true },
    });
  },
};
