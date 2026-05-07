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
   * Atomically reserve a coupon use.
   *
   * SECURITY 2026-05-06 (audit promotions #2): UPDATE atómico con guard
   * `usedCount < maxUses` en una sola query SQL — sin TOCTOU. Antes el
   * patrón findFirst+updateMany dejaba ventana de race que permitía
   * over-use bajo concurrencia.
   */
  async reserveUsage(tenantId: string, id: string): Promise<boolean> {
    // eslint-disable-next-line no-restricted-properties -- guard atómico contra TOCTOU
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "Coupon"
          SET "usedCount" = "usedCount" + 1
        WHERE id = $1 AND "tenantId" = $2
          AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`,
      id,
      tenantId,
    );
    return result > 0;
  },

  /**
   * Legacy increment — usar `reserveUsage` para nuevos callers.
   * Mantenido para backward compat.
   */
  async incrementUsage(tenantId: string, id: string): Promise<void> {
    await prisma.coupon.updateMany({
      where: { id, tenantId },
      data: { usedCount: { increment: 1 } },
    });
  },

  /**
   * Toggle the `active` flag of a coupon. Atomic + scoped al tenant.
   * Returns the new value or null if the coupon doesn't belong to the tenant.
   */
  async setActive(tenantId: string, id: string, active: boolean): Promise<boolean | null> {
    const result = await prisma.coupon.updateMany({
      where: { id, tenantId },
      data: { active },
    });
    return result.count === 0 ? null : active;
  },

  /**
   * Delete a coupon scoped al tenant. Returns true if deleted, false otherwise.
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const result = await prisma.coupon.deleteMany({ where: { id, tenantId } });
    return result.count > 0;
  },

  /**
   * F3 2026-05-07 — Cuenta cuántas veces un customer usó un cupón específico
   * en órdenes no canceladas de los últimos 90 días.
   * Solo lectura — no toca state machine ni idempotency de orders.db.
   * Previene que un único cliente agote un cupón global (maxUses=10) él solo.
   */
  async countUsesByCustomer(
    tenantId: string,
    customerPhone: string,
    couponCode: string,
  ): Promise<number> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return prisma.order.count({
      where: {
        tenantId,
        customerPhone: customerPhone.replace(/\D/g, ""),
        appliedCouponCode: couponCode,
        status: { notIn: ["cancelado"] },
        createdAt: { gte: since },
        deletedAt: null,
      },
    });
  },
};
