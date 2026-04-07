import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { ForbiddenError, NotFoundError } from "@/lib/api-error";
import type { Prisma } from "@/lib/generated/prisma/client";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DbSponsoredBoost = {
  id: string;
  tenantId: string;
  storeId: string;
  productId: number;
  bidAmount: number;
  startDate: string;
  endDate: string;
  status: string;
  impressionsCount: number;
  clicksCount: number;
  conversionsCount: number;
  totalSpentPen: number;
  maxBudgetPen: number;
  createdAt: string;
  updatedAt: string;
};

export type DbBoostCreateParams = {
  storeId: string;
  productId: number;
  bidAmount: number;
  startDate: Date | string;
  endDate: Date | string;
  maxBudgetPen: number;
};

export type DbActiveBoost = {
  id: string;
  storeId: string;
  productId: number;
  bidAmount: number;
  status: string;
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function toDecimalNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d === null || d === undefined) return 0;
  return Number(d);
}

function toISO(d: Date): string {
  return d.toISOString();
}

function mapBoost(b: {
  id: string;
  tenantId: string;
  storeId: string;
  productId: number;
  bidAmount: Prisma.Decimal;
  startDate: Date;
  endDate: Date;
  status: string;
  impressionsCount: number;
  clicksCount: number;
  conversionsCount: number;
  totalSpentPen: Prisma.Decimal;
  maxBudgetPen: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): DbSponsoredBoost {
  return {
    id: b.id,
    tenantId: b.tenantId,
    storeId: b.storeId,
    productId: b.productId,
    bidAmount: toDecimalNum(b.bidAmount),
    startDate: toISO(b.startDate),
    endDate: toISO(b.endDate),
    status: b.status,
    impressionsCount: b.impressionsCount,
    clicksCount: b.clicksCount,
    conversionsCount: b.conversionsCount,
    totalSpentPen: toDecimalNum(b.totalSpentPen),
    maxBudgetPen: toDecimalNum(b.maxBudgetPen),
    createdAt: toISO(b.createdAt),
    updatedAt: toISO(b.updatedAt),
  };
}

// ─── SponsoredBoostsDB ────────────────────────────────────────────────────────

export const SponsoredBoostsDB = {
  /**
   * Crea un boost. Valida que la store pertenezca al tenant.
   */
  async create(tenantId: string, params: DbBoostCreateParams): Promise<DbSponsoredBoost> {
    const store = await prisma.store.findFirst({
      where: { id: params.storeId, tenantId },
      select: { id: true },
    });
    if (!store) {
      throw new ForbiddenError("La tienda no pertenece a este tenant");
    }

    const boost = await prisma.sponsoredBoost.create({
      data: {
        tenantId,
        storeId: params.storeId,
        productId: params.productId,
        bidAmount: params.bidAmount,
        startDate: new Date(params.startDate),
        endDate: new Date(params.endDate),
        maxBudgetPen: params.maxBudgetPen,
        status: "active",
      },
    });

    invalidateByPrefix(`sponsored:${tenantId}`);
    return mapBoost(boost);
  },

  /** Pausa un boost activo. */
  async pause(tenantId: string, boostId: string): Promise<DbSponsoredBoost> {
    const existing = await prisma.sponsoredBoost.findFirst({
      where: { id: boostId, tenantId },
    });
    if (!existing) throw new NotFoundError("Boost no encontrado");
    if (existing.status !== "active") {
      throw new ForbiddenError("Solo se puede pausar un boost activo");
    }

    const updated = await prisma.sponsoredBoost.update({
      where: { id: boostId },
      data: { status: "paused" },
    });

    invalidateByPrefix(`sponsored:${tenantId}`);
    return mapBoost(updated);
  },

  /** Reactiva un boost pausado. */
  async resume(tenantId: string, boostId: string): Promise<DbSponsoredBoost> {
    const existing = await prisma.sponsoredBoost.findFirst({
      where: { id: boostId, tenantId },
    });
    if (!existing) throw new NotFoundError("Boost no encontrado");
    if (existing.status !== "paused") {
      throw new ForbiddenError("Solo se puede reanudar un boost pausado");
    }

    const updated = await prisma.sponsoredBoost.update({
      where: { id: boostId },
      data: { status: "active" },
    });

    invalidateByPrefix(`sponsored:${tenantId}`);
    return mapBoost(updated);
  },

  /** Cancela un boost (cambia a 'expired'). */
  async cancel(tenantId: string, boostId: string): Promise<DbSponsoredBoost> {
    const existing = await prisma.sponsoredBoost.findFirst({
      where: { id: boostId, tenantId },
    });
    if (!existing) throw new NotFoundError("Boost no encontrado");

    const updated = await prisma.sponsoredBoost.update({
      where: { id: boostId },
      data: { status: "expired" },
    });

    invalidateByPrefix(`sponsored:${tenantId}`);
    return mapBoost(updated);
  },

  /**
   * Boosts activos para inyectar en el ranking.
   * Filtra: status='active', now() entre startDate/endDate, budget no agotado.
   */
  async getActiveBoostsForRanking(
    tenantId: string,
    opts?: { storeId?: string; productIds?: number[] },
  ): Promise<DbActiveBoost[]> {
    const now = new Date();

    const boosts = await prisma.sponsoredBoost.findMany({
      where: {
        tenantId,
        status: "active",
        startDate: { lte: now },
        endDate: { gte: now },
        ...(opts?.storeId && { storeId: opts.storeId }),
        ...(opts?.productIds?.length && { productId: { in: opts.productIds } }),
      },
      select: {
        id: true,
        storeId: true,
        productId: true,
        bidAmount: true,
        maxBudgetPen: true,
        totalSpentPen: true,
        status: true,
      },
      orderBy: { bidAmount: "desc" },
    });

    // Filtra en memoria los que tienen budget disponible
    return boosts
      .filter((b) => toDecimalNum(b.totalSpentPen) < toDecimalNum(b.maxBudgetPen))
      .map((b) => ({
        id: b.id,
        storeId: b.storeId,
        productId: b.productId,
        bidAmount: toDecimalNum(b.bidAmount),
        status: b.status,
      }));
  },

  /**
   * Registra una impresión. Cobra bidAmount / 1000 (CPM).
   * Si totalSpentPen >= maxBudgetPen, marca como 'exhausted'.
   */
  async recordImpression(tenantId: string, boostId: string): Promise<void> {
    const boost = await prisma.sponsoredBoost.findFirst({
      where: { id: boostId, tenantId, status: "active" },
      select: { bidAmount: true, totalSpentPen: true, maxBudgetPen: true },
    });
    if (!boost) return;

    const costPerImpression = toDecimalNum(boost.bidAmount) / 1000;
    const newTotal = toDecimalNum(boost.totalSpentPen) + costPerImpression;
    const maxBudget = toDecimalNum(boost.maxBudgetPen);
    const isExhausted = newTotal >= maxBudget;

    await prisma.sponsoredBoost.update({
      where: { id: boostId },
      data: {
        impressionsCount: { increment: 1 },
        totalSpentPen: Math.min(newTotal, maxBudget),
        ...(isExhausted && { status: "exhausted" }),
      },
    });
  },

  /**
   * Registra un click. Costo: bidAmount / 100 (CPC).
   */
  async recordClick(tenantId: string, boostId: string): Promise<void> {
    const boost = await prisma.sponsoredBoost.findFirst({
      where: { id: boostId, tenantId, status: "active" },
      select: { bidAmount: true, totalSpentPen: true, maxBudgetPen: true },
    });
    if (!boost) return;

    const costPerClick = toDecimalNum(boost.bidAmount) / 100;
    const newTotal = toDecimalNum(boost.totalSpentPen) + costPerClick;
    const maxBudget = toDecimalNum(boost.maxBudgetPen);
    const isExhausted = newTotal >= maxBudget;

    await prisma.sponsoredBoost.update({
      where: { id: boostId },
      data: {
        clicksCount: { increment: 1 },
        totalSpentPen: Math.min(newTotal, maxBudget),
        ...(isExhausted && { status: "exhausted" }),
      },
    });
  },

  /**
   * Registra una conversión. Sin costo extra.
   */
  async recordConversion(tenantId: string, boostId: string): Promise<void> {
    await prisma.sponsoredBoost.updateMany({
      where: { id: boostId, tenantId },
      data: { conversionsCount: { increment: 1 } },
    });
  },

  /**
   * Lista los boosts de una tienda específica.
   */
  async listByStore(tenantId: string, storeId: string): Promise<DbSponsoredBoost[]> {
    const boosts = await prisma.sponsoredBoost.findMany({
      where: { tenantId, storeId },
      orderBy: { createdAt: "desc" },
    });
    return boosts.map(mapBoost);
  },

  /**
   * Cron: marca como 'expired' los boosts con endDate pasada.
   */
  async expireOld(tenantId: string): Promise<number> {
    const result = await prisma.sponsoredBoost.updateMany({
      where: {
        tenantId,
        endDate: { lt: new Date() },
        status: { in: ["active", "paused"] },
      },
      data: { status: "expired" },
    });

    if (result.count > 0) {
      invalidateByPrefix(`sponsored:${tenantId}`);
    }

    return result.count;
  },
};
