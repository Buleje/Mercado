import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type DbCoupon = {
  id: string;
  code: string;
  tenantId: string;
  storeId: string | null;
  description: string;
  discountType: string;
  discountValue: number;
  balance: number | null;
  minPurchase: number | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCoupon(c: any): DbCoupon {
  return {
    id: c.id,
    code: c.code,
    tenantId: c.tenantId,
    storeId: c.storeId ?? null,
    description: c.description,
    discountType: c.discountType,
    discountValue: toNumOrZero(c.discountValue),
    balance: c.balance != null ? toNumOrZero(c.balance) : null,
    minPurchase: c.minPurchase != null ? toNumOrZero(c.minPurchase) : null,
    maxUses: c.maxUses ?? null,
    usedCount: c.usedCount,
    active: c.active,
    expiresAt: c.expiresAt ? toISO(c.expiresAt) : null,
    createdAt: toISO(c.createdAt),
  };
}

// ── CouponsDB ────────────────────────────────────────────────────────────────

export const CouponsDB = {
  /**
   * List coupons for a tenant, optionally filtered by storeId.
   * If storeId is provided, returns coupons for that store + tenant-wide coupons (storeId=null).
   */
  async list(tenantId: string, storeId?: string): Promise<DbCoupon[]> {
    const where: Record<string, unknown> = { tenantId };
    if (storeId) {
      // Return store-specific + tenant-wide coupons
      where.OR = [{ storeId }, { storeId: null }];
      delete where.tenantId;
      // Re-add tenantId inside the OR-compatible structure
      const rows = await prisma.coupon.findMany({
        where: {
          tenantId,
          OR: [{ storeId }, { storeId: null }],
        },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapCoupon);
    }

    const rows = await prisma.coupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapCoupon);
  },

  /**
   * List coupons strictly for one store (excludes tenant-wide).
   */
  async listByStore(tenantId: string, storeId: string): Promise<DbCoupon[]> {
    const rows = await prisma.coupon.findMany({
      where: { tenantId, storeId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapCoupon);
  },

  /**
   * Get a single coupon by ID within tenant scope.
   */
  async getById(tenantId: string, id: string): Promise<DbCoupon | null> {
    const row = await prisma.coupon.findFirst({
      where: { id, tenantId },
    });
    return row ? mapCoupon(row) : null;
  },

  /**
   * Find a coupon by code within tenant scope, optionally scoped to a store.
   */
  async findByCode(tenantId: string, code: string, storeId?: string): Promise<DbCoupon | null> {
    if (storeId) {
      // Try store-specific first, then tenant-wide
      const storeSpecific = await prisma.coupon.findFirst({
        where: { tenantId, code, storeId, active: true },
      });
      if (storeSpecific) return mapCoupon(storeSpecific);

      const tenantWide = await prisma.coupon.findFirst({
        where: { tenantId, code, storeId: null, active: true },
      });
      return tenantWide ? mapCoupon(tenantWide) : null;
    }

    const row = await prisma.coupon.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    return row ? mapCoupon(row) : null;
  },

  /**
   * Create a new coupon, optionally scoped to a store.
   */
  async create(
    tenantId: string,
    data: {
      code: string;
      storeId?: string | null;
      description?: string;
      discountType: string;
      discountValue: number;
      minPurchase?: number | null;
      maxUses?: number | null;
      expiresAt?: Date | null;
    },
  ): Promise<DbCoupon> {
    const row = await prisma.coupon.create({
      data: {
        code: data.code,
        tenantId,
        storeId: data.storeId ?? null,
        description: data.description ?? "",
        discountType: data.discountType,
        discountValue: data.discountValue,
        minPurchase: data.minPurchase ?? null,
        maxUses: data.maxUses ?? null,
        expiresAt: data.expiresAt ?? null,
      },
    });
    return mapCoupon(row);
  },

  /**
   * Increment the used count of a coupon.
   */
  async incrementUsage(tenantId: string, id: string): Promise<void> {
    await prisma.coupon.updateMany({
      where: { id, tenantId },
      data: { usedCount: { increment: 1 } },
    });
  },
};
