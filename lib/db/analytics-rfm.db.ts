import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

/**
 * lib/db/analytics-rfm.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de prisma directo a DB class.
 * RFM (Recency, Frequency, Monetary): extrae ventas POS y órdenes online
 * con customerPhone para el período solicitado. El scoring percentil y la
 * clasificación de segmentos quedan en el route handler (lógica pura, no DB).
 *
 * Todas las queries scopean por tenantId (regla #3 CLAUDE.md).
 */

export type RFMSaleRaw = {
  customerPhone: string;
  total: number;
  createdAt: Date;
};

export type RFMOrderRaw = {
  customerPhone: string;
  total: number;
  createdAt: Date;
};

export type RFMCustomerName = {
  phone: string;
  name: string;
};

export const AnalyticsRFMDB = {
  /**
   * Carga ventas POS con customerPhone del tenant en el período indicado.
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param since    — Fecha de corte (inclusive).
   */
  async getSalesWithPhone(
    tenantId: string,
    since: Date
  ): Promise<RFMSaleRaw[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:rfm`);
    const rows = await prisma.sale.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        customerPhone: { not: null },
      },
      select: { customerPhone: true, total: true, createdAt: true },
    });

    return rows
      .filter((r): r is typeof r & { customerPhone: string } =>
        r.customerPhone !== null
      )
      .map((r) => ({
        customerPhone: r.customerPhone,
        total: Number(r.total),
        createdAt: r.createdAt,
      }));
  },

  /**
   * Carga órdenes online no canceladas con customerPhone del tenant en el período.
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param since    — Fecha de corte (inclusive).
   */
  async getOrdersWithPhone(
    tenantId: string,
    since: Date
  ): Promise<RFMOrderRaw[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:rfm`);
    const rows = await prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        customerPhone: { not: null },
        status: { not: "cancelado" },
      },
      select: { customerPhone: true, total: true, createdAt: true },
    });

    return rows
      .filter((r): r is typeof r & { customerPhone: string } =>
        r.customerPhone !== null
      )
      .map((r) => ({
        customerPhone: r.customerPhone,
        total: Number(r.total),
        createdAt: r.createdAt,
      }));
  },

  /**
   * Carga nombres de clientes por teléfono para enriquecer resultados RFM.
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param phones   — Lista de teléfonos a consultar.
   */
  async getCustomerNamesByPhone(
    tenantId: string,
    phones: string[]
  ): Promise<RFMCustomerName[]> {
    return prisma.customer.findMany({
      where: { tenantId, phone: { in: phones } },
      select: { phone: true, name: true },
    });
  },
};
