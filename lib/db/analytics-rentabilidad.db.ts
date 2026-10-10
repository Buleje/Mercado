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

/**
 * Una línea vendida, ya normalizada, venga de POS o de una orden online.
 * `costPrice` es el costo congelado al momento de la venta; cuando falta se
 * cae al costo actual del producto (`productCostPrice`).
 */
export type RentabilidadProductLineRaw = {
  productId: number;
  name: string;
  category: string | null;
  price: number;
  quantity: number;
  costPrice: number | null;
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

  /**
   * Líneas vendidas por POS en el rango, con nombre y categoría del producto.
   * Filtra por tenantId via relación Sale → tenantId.
   *
   * Cap defensivo de 50k como en analytics-abc.db: evita OOM si el tenant
   * acumuló cientos de miles de líneas.
   *
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param since    — Fecha de inicio (inclusive).
   */
  async getSaleLinesByProduct(
    tenantId: string,
    since: Date
  ): Promise<RentabilidadProductLineRaw[]> {
    const rows = await prisma.saleItem.findMany({
      where: { sale: { tenantId, createdAt: { gte: since } } },
      select: {
        productId: true,
        name: true,
        price: true,
        quantity: true,
        costPrice: true,
        product: { select: { category: true, costPrice: true } },
      },
      orderBy: { id: "desc" },
      take: 50_000,
    });

    return rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      category: r.product.category,
      price: Number(r.price),
      quantity: r.quantity,
      costPrice: r.costPrice !== null ? Number(r.costPrice) : null,
      productCostPrice:
        r.product.costPrice !== null ? Number(r.product.costPrice) : null,
    }));
  },

  /**
   * Líneas vendidas por órdenes online (no canceladas) en el rango.
   * Filtra por tenantId via relación Order → tenantId.
   *
   * Se excluyen las líneas sin `productId` (producto borrado): sin producto no
   * hay costo con el que calcular margen, y contar solo el ingreso inflaría la
   * ganancia.
   *
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param since    — Fecha de inicio (inclusive).
   */
  async getOrderLinesByProduct(
    tenantId: string,
    since: Date
  ): Promise<RentabilidadProductLineRaw[]> {
    const rows = await prisma.orderItem.findMany({
      where: {
        productId: { not: null },
        order: { tenantId, status: { not: "cancelado" }, createdAt: { gte: since } },
      },
      select: {
        productId: true,
        name: true,
        price: true,
        quantity: true,
        costPrice: true,
        product: { select: { category: true, costPrice: true } },
      },
      orderBy: { id: "desc" },
      take: 50_000,
    });

    return rows.flatMap((r) =>
      r.productId === null
        ? []
        : [
            {
              productId: r.productId,
              name: r.name,
              category: r.product?.category ?? null,
              price: Number(r.price),
              quantity: r.quantity,
              costPrice: r.costPrice !== null ? Number(r.costPrice) : null,
              productCostPrice:
                r.product?.costPrice != null ? Number(r.product.costPrice) : null,
            },
          ]
    );
  },
};
