import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import type {
  Promotion as PPromotion,
  Coupon as PCoupon,
  Prisma as PrismaTypes,
} from "@/lib/generated/prisma/client";
import {
  type DbPromotion,
} from "./misc.db";

// ── Local Types ───────────────────────────────────────────────────────────────

export type DbCoupon = {
  id: string;
  code: string;
  description: string;
  discountType: "percent" | "fixed" | "giftcard";
  discountValue: number;
  balance?: number;
  minPurchase?: number;
  maxUses?: number;
  usedCount: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapPromotion(p: PPromotion): DbPromotion {
  return {
    // TD-018: discountPercent / minPurchase son Decimal → serializar a number
    id: p.id, name: p.name, description: p.description, discountPercent: toNumOrZero(p.discountPercent),
    ...(p.minPurchase != null && { minPurchase: toNumOrZero(p.minPurchase) }),
    ...(p.imageUrl != null && { imageUrl: p.imageUrl }),
    ...(p.message != null && { message: p.message }),
    targetType: p.targetType,
    ...(p.targetPhones != null && { targetPhones: p.targetPhones }),
    active: p.active, createdAt: toISO(p.createdAt),
    ...(p.expiresAt != null && { expiresAt: toISO(p.expiresAt) }),
  };
}

function mapCoupon(c: PCoupon): DbCoupon {
  return {
    id: c.id, code: c.code, description: c.description,
    // TD-018: discountValue / balance / minPurchase son Decimal
    discountType: c.discountType as "percent" | "fixed" | "giftcard", discountValue: toNumOrZero(c.discountValue),
    ...(c.balance != null && { balance: toNumOrZero(c.balance) }),
    ...(c.minPurchase != null && { minPurchase: toNumOrZero(c.minPurchase) }),
    ...(c.maxUses != null && { maxUses: c.maxUses }),
    usedCount: c.usedCount, active: c.active,
    ...(c.expiresAt != null && { expiresAt: toISO(c.expiresAt) }),
    createdAt: toISO(c.createdAt),
  };
}

// ── Promotions DB ─────────────────────────────────────────────────────────────

export const PromotionsDB = {
  async getAll(tenantId: string): Promise<DbPromotion[]> {
    "use cache";
    // Promociones storefront — cambian con baja frecuencia (admin las crea
    // manualmente). 5 min revalidate balance perceived freshness vs DB load.
    cacheLife({ revalidate: 300, stale: 60, expire: 1800 });
    cacheTag(`tenant:${tenantId}:promotions`);

    const where: Record<string, unknown> = { tenantId };
    return (await prisma.promotion.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapPromotion);
  },
  async add(p: DbPromotion, tenantId: string): Promise<DbPromotion> {
    const row = await prisma.promotion.create({
      data: {
        id: p.id, name: p.name, description: p.description, discountPercent: p.discountPercent,
        minPurchase: p.minPurchase, imageUrl: p.imageUrl, message: p.message,
        targetType: p.targetType ?? "all", targetPhones: p.targetPhones,
        active: p.active, expiresAt: p.expiresAt ? new Date(p.expiresAt) : null, tenantId,
      },
    });
    return mapPromotion(row);
  },
  async update(id: string, patch: Partial<DbPromotion>): Promise<DbPromotion | null> {
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.discountPercent !== undefined) data.discountPercent = patch.discountPercent;
    if (patch.minPurchase !== undefined) data.minPurchase = patch.minPurchase;
    if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
    if (patch.message !== undefined) data.message = patch.message;
    if (patch.targetType !== undefined) data.targetType = patch.targetType;
    if (patch.targetPhones !== undefined) data.targetPhones = patch.targetPhones;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
    const row = await prisma.promotion.update({ where: { id }, data });
    return mapPromotion(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.promotion.delete({ where: { id } }).catch((err) => {
      logger.error("[promotions.db] delete failed", { id, error: String(err) });
    });
  },
};

// ── Coupons DB ────────────────────────────────────────────────────────────────

export const CouponsDB = {
  async getAll(tenantId: string): Promise<DbCoupon[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapCoupon);
  },
  // RED-007: tenant-scoped lookup. The function accepts both shapes — legacy
  // (code) and secure (tenantId, code) — and the typed cast below exposes
  // overloaded signatures so new callers can supply the tenantId. Always
  // prefer the (tenantId, code) form to prevent cross-tenant coupon reuse.
  getByCode: (async (
    a: string,
    b?: string,
  ): Promise<DbCoupon | null> => {
    const scoped = b !== undefined;
    const code = (scoped ? (b as string) : a).toUpperCase().trim();
    const where: PrismaTypes.CouponWhereInput = scoped
      ? { code, tenantId: a }
      : { code };
    const row = await prisma.coupon.findFirst({ where });
    return row ? mapCoupon(row) : null;
  }) as {
    (code: string): Promise<DbCoupon | null>;
    (tenantId: string, code: string): Promise<DbCoupon | null>;
  },
  async add(c: Omit<DbCoupon, "id" | "createdAt" | "usedCount">, tenantId: string): Promise<DbCoupon> {
    const row = await prisma.coupon.create({
      data: {
        code: c.code.toUpperCase().trim(), description: c.description,
        discountType: c.discountType, discountValue: c.discountValue,
        balance: c.discountType === "giftcard" ? (c.balance ?? c.discountValue) : null,
        minPurchase: c.minPurchase, maxUses: c.maxUses,
        active: c.active, expiresAt: c.expiresAt ? new Date(c.expiresAt) : null, tenantId,
      },
    });
    return mapCoupon(row);
  },
  async update(id: string, patch: Partial<DbCoupon>): Promise<DbCoupon | null> {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.code !== undefined) data.code = patch.code.toUpperCase().trim();
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.discountType !== undefined) data.discountType = patch.discountType;
    if (patch.discountValue !== undefined) data.discountValue = patch.discountValue;
    if (patch.balance !== undefined) data.balance = patch.balance;
    if (patch.minPurchase !== undefined) data.minPurchase = patch.minPurchase;
    if (patch.maxUses !== undefined) data.maxUses = patch.maxUses;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
    const row = await prisma.coupon.update({ where: { id }, data });
    return mapCoupon(row);
  },
  // RED-006 + RED-007: atomic, tenant-scoped redemption. The conditional UPDATE
  // executes server-side in PostgreSQL so two parallel callers cannot both
  // read usedCount=N and both bump to N+1 (only one wins, the other gets 0
  // affected rows). The typed cast below exposes overloaded signatures —
  // prefer (tenantId, code, amount).
  redeem: (async (
    a: string,
    b?: string | number,
    c?: number,
  ): Promise<DbCoupon | null> => {
    // Disambiguate the two call shapes:
    //   redeem(code)                         → a=code, b=undefined
    //   redeem(code, amount)                 → a=code, b=number
    //   redeem(tenantId, code)               → a=tid,  b=string
    //   redeem(tenantId, code, amount)       → a=tid,  b=string, c=number
    let tenantId: string | null;
    let rawCode: string;
    let deductAmount: number | undefined;
    if (typeof b === "string") {
      tenantId = a;
      rawCode = b;
      deductAmount = c;
    } else {
      tenantId = null;
      rawCode = a;
      deductAmount = b;
    }
    const code = rawCode.toUpperCase().trim();
    const now = new Date();

    // ── Atomic conditional UPDATE — the core race-safety guarantee ─────────
    // We use $executeRaw with a column-to-column comparison ("usedCount" <
    // "maxUses") which Prisma's typed updateMany cannot express. Returns the
    // number of rows affected; 0 means the coupon is invalid, expired,
    // exhausted, inactive, or owned by a different tenant.
    const tenantClause = tenantId
      ? Prisma.sql`AND "tenantId" = ${tenantId}`
      : Prisma.empty;
    const affected = await prisma.$executeRaw`
      UPDATE "Coupon"
         SET "usedCount" = "usedCount" + 1
       WHERE "code" = ${code}
         ${tenantClause}
         AND "active" = true
         AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
         AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
    `;
    if (affected === 0) return null;

    // Re-fetch the (now-incremented) row, scoped by tenant if known.
    const where: PrismaTypes.CouponWhereInput = tenantId
      ? { code, tenantId }
      : { code };
    const row = await prisma.coupon.findFirst({ where });
    if (!row) return null;

    // Giftcard balance adjustment is a follow-up write — not part of the
    // atomic guard above because the column-to-column subtraction is too
    // gnarly to express in a single conditional UPDATE. The maxUses guard
    // (set to 1 on giftcards in practice) is the primary single-use defence.
    if (row.discountType === "giftcard" && deductAmount != null) {
      const currentBalance =
        toNumOrZero(row.balance) || toNumOrZero(row.discountValue);
      const newBalance = Math.max(0, currentBalance - deductAmount);
      const updated = await prisma.coupon.update({
        where: { id: row.id },
        data: {
          balance: newBalance,
          ...(newBalance <= 0 ? { active: false } : {}),
        },
      });
      return mapCoupon(updated);
    }

    return mapCoupon(row);
  }) as {
    (code: string, deductAmount?: number): Promise<DbCoupon | null>;
    (tenantId: string, code: string, deductAmount?: number): Promise<DbCoupon | null>;
  },
  async delete(id: string): Promise<void> {
    await prisma.coupon.delete({ where: { id } }).catch((err) => {
      logger.error("[coupons.db] delete failed", { id, error: String(err) });
    });
  },
};
