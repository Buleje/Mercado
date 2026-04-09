import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import type {
  Promotion as PPromotion,
  Coupon as PCoupon,
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
  async getAll(tenantId?: string): Promise<DbPromotion[]> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    return (await prisma.promotion.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapPromotion);
  },
  async add(p: DbPromotion, tenantId = "main"): Promise<DbPromotion> {
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
    await prisma.promotion.delete({ where: { id } }).catch(() => {});
  },
};

// ── Coupons DB ────────────────────────────────────────────────────────────────

export const CouponsDB = {
  async getAll(tenantId?: string): Promise<DbCoupon[]> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    return (await prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapCoupon);
  },
  async getByCode(code: string): Promise<DbCoupon | null> {
    const row = await prisma.coupon.findFirst({ where: { code: code.toUpperCase().trim() } });
    return row ? mapCoupon(row) : null;
  },
  async add(c: Omit<DbCoupon, "id" | "createdAt" | "usedCount">, tenantId = "main"): Promise<DbCoupon> {
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
  async redeem(code: string, deductAmount?: number): Promise<DbCoupon | null> {
    const row = await prisma.coupon.findFirst({ where: { code: code.toUpperCase().trim() } });
    if (!row || !row.active) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    if (row.maxUses && row.usedCount >= row.maxUses) return null;
    const data: Record<string, unknown> = { usedCount: row.usedCount + 1 };
    // Deduct balance for giftcard type
    if (row.discountType === "giftcard" && deductAmount != null) {
      // TD-018: balance / discountValue son Decimal
      const currentBalance = toNumOrZero(row.balance) || toNumOrZero(row.discountValue);
      const newBalance = Math.max(0, currentBalance - deductAmount);
      data.balance = newBalance;
      if (newBalance <= 0) data.active = false;
    }
    const updated = await prisma.coupon.update({ where: { id: row.id }, data });
    return mapCoupon(updated);
  },
  async delete(id: string): Promise<void> {
    await prisma.coupon.delete({ where: { id } }).catch(() => {});
  },
};
