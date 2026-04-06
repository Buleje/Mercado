import "server-only";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DbSupplierPriceVersion = {
  id: string;
  supplierId: string;
  productName: string;
  sku?: string;
  oldPrice: number;
  newPrice: number;
  effectiveDate: string;
  createdAt: string;
};

export type DbSupplierRating = {
  id: string;
  tenantId: string;
  supplierId: string;
  period: string;
  ordersPlaced: number;
  ordersDelivered: number;
  ordersOnTime: number;
  avgDeliveryDays?: number;
  fillRate?: number;
  qualityScore?: number;
  calculatedAt: string;
};

export type DbSupplierOffer = {
  id: string;
  supplierId: string;
  title: string;
  description?: string;
  discountPercent?: number;
  minQuantity?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ─── SupplierPriceVersionDB ───────────────────────────────────────────────────

export const SupplierPriceVersionDB = {
  async getBySupplierId(supplierId: string, limit = 50): Promise<DbSupplierPriceVersion[]> {
    const rows = await prisma.supplierPriceVersion.findMany({
      where: { supplierId },
      orderBy: { effectiveDate: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      supplierId: r.supplierId,
      productName: r.productName,
      ...(r.sku != null && { sku: r.sku }),
      oldPrice: r.oldPrice,
      newPrice: r.newPrice,
      effectiveDate: toISO(r.effectiveDate),
      createdAt: toISO(r.createdAt),
    }));
  },

  async create(tenantId: string, data: Omit<DbSupplierPriceVersion, "id" | "createdAt" | "effectiveDate">): Promise<DbSupplierPriceVersion> {
    const row = await prisma.supplierPriceVersion.create({
      data: {
        tenantId,
        supplierId: data.supplierId,
        productName: data.productName,
        sku: data.sku ?? null,
        oldPrice: data.oldPrice,
        newPrice: data.newPrice,
      },
    });
    return {
      id: row.id,
      supplierId: row.supplierId,
      productName: row.productName,
      ...(row.sku != null && { sku: row.sku }),
      oldPrice: row.oldPrice,
      newPrice: row.newPrice,
      effectiveDate: toISO(row.effectiveDate),
      createdAt: toISO(row.createdAt),
    };
  },
};

// ─── SupplierRatingDB ─────────────────────────────────────────────────────────

export const SupplierRatingDB = {
  async getBySupplierId(supplierId: string): Promise<DbSupplierRating[]> {
    const rows = await prisma.supplierRating.findMany({
      where: { supplierId },
      orderBy: { period: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      supplierId: r.supplierId,
      period: r.period,
      ordersPlaced: r.ordersPlaced,
      ordersDelivered: r.ordersDelivered,
      ordersOnTime: r.ordersOnTime,
      ...(r.avgDeliveryDays != null && { avgDeliveryDays: r.avgDeliveryDays }),
      ...(r.fillRate != null && { fillRate: r.fillRate }),
      ...(r.qualityScore != null && { qualityScore: r.qualityScore }),
      calculatedAt: toISO(r.calculatedAt),
    }));
  },

  /** Promedio anonimizado de todos los proveedores del tenant para un periodo */
  async getTenantAverage(
    tenantId: string,
    period: string,
  ): Promise<{ fillRate: number; avgDeliveryDays: number; qualityScore: number }> {
    const agg = await prisma.supplierRating.aggregate({
      where: { tenantId, period },
      _avg: { fillRate: true, avgDeliveryDays: true, qualityScore: true },
    });
    return {
      fillRate: Math.round((agg._avg.fillRate ?? 0) * 10) / 10,
      avgDeliveryDays: Math.round((agg._avg.avgDeliveryDays ?? 0) * 10) / 10,
      qualityScore: Math.round((agg._avg.qualityScore ?? 0) * 10) / 10,
    };
  },

  /** Ranking del proveedor respecto al tenant (posición, total) */
  async getRanking(
    tenantId: string,
    supplierId: string,
    period: string,
  ): Promise<{ position: number; total: number }> {
    const all = await prisma.supplierRating.findMany({
      where: { tenantId, period },
      orderBy: { fillRate: "desc" },
      select: { supplierId: true },
    });
    const total = all.length;
    const position = all.findIndex((r) => r.supplierId === supplierId) + 1;
    return { position: position || total, total };
  },

  async upsert(data: Omit<DbSupplierRating, "id" | "calculatedAt">): Promise<DbSupplierRating> {
    const row = await prisma.supplierRating.upsert({
      where: {
        tenantId_supplierId_period: {
          tenantId: data.tenantId,
          supplierId: data.supplierId,
          period: data.period,
        },
      },
      update: {
        ordersPlaced: data.ordersPlaced,
        ordersDelivered: data.ordersDelivered,
        ordersOnTime: data.ordersOnTime,
        avgDeliveryDays: data.avgDeliveryDays ?? null,
        fillRate: data.fillRate ?? null,
        qualityScore: data.qualityScore ?? null,
        calculatedAt: new Date(),
      },
      create: {
        tenantId: data.tenantId,
        supplierId: data.supplierId,
        period: data.period,
        ordersPlaced: data.ordersPlaced,
        ordersDelivered: data.ordersDelivered,
        ordersOnTime: data.ordersOnTime,
        avgDeliveryDays: data.avgDeliveryDays ?? null,
        fillRate: data.fillRate ?? null,
        qualityScore: data.qualityScore ?? null,
      },
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      supplierId: row.supplierId,
      period: row.period,
      ordersPlaced: row.ordersPlaced,
      ordersDelivered: row.ordersDelivered,
      ordersOnTime: row.ordersOnTime,
      ...(row.avgDeliveryDays != null && { avgDeliveryDays: row.avgDeliveryDays }),
      ...(row.fillRate != null && { fillRate: row.fillRate }),
      ...(row.qualityScore != null && { qualityScore: row.qualityScore }),
      calculatedAt: toISO(row.calculatedAt),
    };
  },
};

// ─── SupplierOfferDB ──────────────────────────────────────────────────────────

export const SupplierOfferDB = {
  async getActive(supplierId: string): Promise<DbSupplierOffer[]> {
    const now = new Date();
    const rows = await prisma.supplierOffer.findMany({
      where: {
        supplierId,
        isActive: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      orderBy: { validUntil: "asc" },
    });
    return rows.map(mapOffer);
  },

  async getAll(supplierId: string): Promise<DbSupplierOffer[]> {
    const rows = await prisma.supplierOffer.findMany({
      where: { supplierId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapOffer);
  },

  async create(tenantId: string, data: Omit<DbSupplierOffer, "id" | "createdAt">): Promise<DbSupplierOffer> {
    const row = await prisma.supplierOffer.create({
      data: {
        tenantId,
        supplierId: data.supplierId,
        title: data.title,
        description: data.description ?? null,
        discountPercent: data.discountPercent ?? null,
        minQuantity: data.minQuantity ?? null,
        validFrom: new Date(data.validFrom),
        validUntil: new Date(data.validUntil),
        isActive: data.isActive,
      },
    });
    return mapOffer(row);
  },
};

function mapOffer(r: {
  id: string;
  supplierId: string;
  title: string;
  description: string | null;
  discountPercent: number | null;
  minQuantity: number | null;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  createdAt: Date;
}): DbSupplierOffer {
  return {
    id: r.id,
    supplierId: r.supplierId,
    title: r.title,
    ...(r.description != null && { description: r.description }),
    ...(r.discountPercent != null && { discountPercent: r.discountPercent }),
    ...(r.minQuantity != null && { minQuantity: r.minQuantity }),
    validFrom: toISO(r.validFrom),
    validUntil: toISO(r.validUntil),
    isActive: r.isActive,
    createdAt: toISO(r.createdAt),
  };
}
