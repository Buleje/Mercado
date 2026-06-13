import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsMarginsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/margins.
 *
 * SECURITY FIX cross-tenant: el endpoint original hacía `saleItem.findMany`
 * SIN filtro tenantId — data leak entre tenants (mismo bug encontrado por
 * el batch #5 agent B en /api/analytics/abc). Ahora filtramos via join
 * relacional sale.tenantId para garantizar aislamiento.
 */

export const AnalyticsMarginsDB = {
  /**
   * SaleItems con costo para cálculo de márgenes. Scope por tenantId
   * via join con Sale relacional.
   */
  async getSaleItemsForMargins(tenantId: string) {
    return prisma.saleItem.findMany({
      where: {
        sale: { tenantId },
      },
      select: {
        productId: true,
        name: true,
        price: true,
        costPrice: true,
        quantity: true,
        product: { select: { category: true } },
      },
      // Cap defensivo (Brandon 2026-06-13, audit perf): sin take, un tenant con
      // cientos de miles de SaleItem → OOM en Vercel Fluid. 50k items cubre años
      // de operación de una bodega; ordenamos por recientes para que el cálculo
      // de márgenes refleje el período relevante si se llega al tope.
      orderBy: { id: "desc" },
      take: 50_000,
    });
  },
};
