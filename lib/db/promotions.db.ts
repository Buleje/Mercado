import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
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
  async update(tenantId: string, id: string, patch: Partial<DbPromotion>): Promise<DbPromotion | null> {
    const existing = await prisma.promotion.findFirst({ where: { id, tenantId } });
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
    // Use updateMany with tenantId to avoid IDOR race condition
    await prisma.promotion.updateMany({ where: { id, tenantId }, data });
    // SECURITY 2026-05-05 (audit promotions #11): invalidar cache tras write.
    // Antes los cambios no se reflejaban hasta que expirara revalidate (5min).
    revalidateTag(`tenant:${tenantId}:promotions`, "max");
    const row = await prisma.promotion.findFirst({ where: { id, tenantId } });
    return row ? mapPromotion(row) : null;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.promotion.deleteMany({ where: { id, tenantId } }).catch((err) => {
      logger.error("[promotions.db] delete failed", { id, error: String(err) });
    });
    revalidateTag(`tenant:${tenantId}:promotions`, "max");
  },
};

// ── Coupons DB ────────────────────────────────────────────────────────────────

export const CouponsDB = {
  async getAll(tenantId: string): Promise<DbCoupon[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" } })).map(mapCoupon);
  },
  // PENTEST 2026-05-18 Sprint C #8: eliminada la firma legacy (code: string)
  // sin tenantId. Antes el overload aceptaba ambas formas — landmine para
  // futuros callers o GPT pegando código que pudiera leer un cupón cross-tenant
  // por accidente. Verificado por grep que todos los callers actuales pasan
  // tenantId. tenantId-scoped lookup obligatorio.
  async getByCode(tenantId: string, code: string): Promise<DbCoupon | null> {
    const normalized = code.toUpperCase().trim();
    const row = await prisma.coupon.findFirst({
      where: { code: normalized, tenantId },
    });
    return row ? mapCoupon(row) : null;
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
  async update(tenantId: string, id: string, patch: Partial<DbCoupon>): Promise<DbCoupon | null> {
    const existing = await prisma.coupon.findFirst({ where: { id, tenantId } });
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
    // Use updateMany with tenantId to avoid IDOR race condition
    await prisma.coupon.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.coupon.findFirst({ where: { id, tenantId } });
    return row ? mapCoupon(row) : null;
  },
  // RED-006 + RED-007: atomic, tenant-scoped redemption. The conditional UPDATE
  // executes server-side in PostgreSQL so two parallel callers cannot both
  // read usedCount=N and both bump to N+1 (only one wins, the other gets 0
  // affected rows).
  //
  // PENTEST 2026-05-18 Sprint C #8: eliminada la firma legacy (code, amount?)
  // sin tenantId — landmine cross-tenant. tenantId obligatorio.
  async redeem(
    tenantId: string,
    code: string,
    deductAmount?: number,
  ): Promise<DbCoupon | null> {
    const normalized = code.toUpperCase().trim();
    const now = new Date();

    // ── Atomic conditional UPDATE — the core race-safety guarantee ─────────
    // We use $executeRaw with a column-to-column comparison ("usedCount" <
    // "maxUses") which Prisma's typed updateMany cannot express. Returns the
    // number of rows affected; 0 means the coupon is invalid, expired,
    // exhausted, inactive, or owned by a different tenant.
    const affected = await prisma.$executeRaw`
      UPDATE "Coupon"
         SET "usedCount" = "usedCount" + 1
       WHERE "code" = ${normalized}
         AND "tenantId" = ${tenantId}
         AND "active" = true
         AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
         AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
    `;
    if (affected === 0) return null;

    // Re-fetch the (now-incremented) row, scoped by tenant.
    const row = await prisma.coupon.findFirst({
      where: { code: normalized, tenantId },
    });
    if (!row) return null;

    // Giftcard balance adjustment is a follow-up write — not part of the
    // atomic guard above because the column-to-column subtraction is too
    // gnarly to express in a single conditional UPDATE. The maxUses guard
    // (set to 1 on giftcards in practice) is the primary single-use defence.
    if (row.discountType === "giftcard" && deductAmount != null) {
      const currentBalance =
        toNumOrZero(row.balance) || toNumOrZero(row.discountValue);
      const newBalance = Math.max(0, currentBalance - deductAmount);
      await prisma.coupon.updateMany({
        where: { id: row.id, tenantId },
        data: {
          balance: newBalance,
          ...(newBalance <= 0 ? { active: false } : {}),
        },
      });
      const updated = await prisma.coupon.findFirst({
        where: { id: row.id, tenantId },
      });
      return updated ? mapCoupon(updated) : null;
    }

    return mapCoupon(row);
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.coupon.deleteMany({ where: { id, tenantId } }).catch((err) => {
      logger.error("[coupons.db] delete failed", { id, error: String(err) });
    });
  },
};
