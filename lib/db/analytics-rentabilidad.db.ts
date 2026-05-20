import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * lib/db/analytics-rentabilidad.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de prisma directo a DB class.
 * Rentabilidad diaria: carga ventas POS y sus items de costo para los últimos
 * 30 días. El cálculo de margen bruto diario queda en el route handler.
 *
 * Todas las queries scopean por tenantId (regla #3 CLAUDE.md).
 */

export type RentabilidadSaleRaw = {
  id: string;
  total: number;
  createdAt: Date;
};

export type RentabilidadSaleItemRaw = {
  saleId: string;
  costPrice: number | null;
  quantity: number;
  productCostPrice: number | null;
};

export const AnalyticsRentabilidadDB = {
  /**
   * Carga ventas POS del tenant en un rango de fechas.
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param since    — Fecha de inicio (inclusive).
   */
  async getSalesInRange(
    tenantId: string,
    since: Date
  ): Promise<RentabilidadSaleRaw[]> {
    const rows = await prisma.sale.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { id: true, total: true, createdAt: true },
    });

    return rows.map((r) => ({
      id: r.id,
      total: Number(r.total),
      createdAt: r.createdAt,
    }));
  },

  /**
   * Carga items de ventas POS con precio de costo (propio o del producto padre).
   * Filtra por tenantId via relación Sale → tenantId y por rango de fecha.
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param since    — Fecha de inicio (inclusive).
   */
  async getSaleItemCostsInRange(
    tenantId: string,
    since: Date
  ): Promise<RentabilidadSaleItemRaw[]> {
    const rows = await prisma.saleItem.findMany({
      where: { sale: { tenantId, createdAt: { gte: since } } },
      select: {
        saleId: true,
        costPrice: true,
        quantity: true,
        product: { select: { costPrice: true } },
      },
    });

    return rows.map((r) => ({
      saleId: r.saleId,
      costPrice: r.costPrice !== null ? Number(r.costPrice) : null,
      quantity: r.quantity,
      productCostPrice:
        r.product.costPrice !== null ? Number(r.product.costPrice) : null,
    }));
  },
};
