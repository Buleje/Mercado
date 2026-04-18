import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";
import { ApiError, NotFoundError, ValidationError } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import type {
  SubscriptionFreq,
  SubscriptionStatus,
  Prisma,
} from "@/lib/generated/prisma/client";

/**
 * lib/db/subscriptions.db.ts — ADR-076 (Subscription Bodega al Mes)
 *
 * Source of truth for every read/write over `Subscription` and
 * `SubscriptionDelivery`. Consumers (API routes, context, cron) must go
 * through this class — never touch `prisma.subscription.*` directly.
 *
 * CLAUDE.md compliance:
 *   #1 — never bypass this class to touch Subscription/SubscriptionDelivery
 *   #2 — safeParse() for every input
 *   #3 — tenantId is the FIRST parameter on every public method
 *   #5 — invalidate / invalidateByPrefix after every write
 *   #6 — totals (MRR, projected savings) computed here, not client-side
 *   #7 — activity log is fire-and-forget (logger.warn on rejection)
 */

// ── Errors ───────────────────────────────────────────────────────────────────

export class SubscriptionCrossTenantError extends ApiError {
  constructor() {
    super(
      "SUBSCRIPTION_CROSS_TENANT",
      "Subscription belongs to a different tenant",
      403,
    );
  }
}

export class SubscriptionInvalidStatusError extends ApiError {
  constructor(from: SubscriptionStatus, to: SubscriptionStatus) {
    super(
      "SUBSCRIPTION_INVALID_STATUS_TRANSITION",
      `Cannot transition subscription from '${from}' to '${to}'`,
      409,
      { from, to },
    );
  }
}

// ── Zod schemas (safeParse only — CLAUDE.md #2) ──────────────────────────────

const FREQ_VALUES = ["weekly", "biweekly", "monthly", "bimonthly"] as const;
const STATUS_VALUES = ["active", "paused", "cancelled"] as const;

export const CreateSubscriptionInput = z.object({
  userId: z.string().min(1),
  productId: z.number().int().positive(),
  frequency: z.enum(FREQ_VALUES),
  quantity: z.number().int().min(1).max(999).default(1),
  /** Decimal percent (0.05 = 5 %). Defaults to 5 %. */
  discount: z.number().min(0).max(0.9999).default(0.05),
});
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionInput>;

export const UpdateStatusInput = z.object({
  status: z.enum(STATUS_VALUES),
  cancelReason: z.string().max(500).optional(),
});
export type UpdateStatusInput = z.infer<typeof UpdateStatusInput>;

export const ChangeFrequencyInput = z.object({
  frequency: z.enum(FREQ_VALUES),
});
export type ChangeFrequencyInput = z.infer<typeof ChangeFrequencyInput>;

// ── DTOs returned to API routes (tiny, serializable — no Decimal objects) ──

export interface SubscriptionDto {
  id: string;
  tenantId: string;
  userId: string;
  productId: number;
  frequency: SubscriptionFreq;
  quantity: number;
  /** 0.05 = 5 %. Coerced to number for JSON. */
  discount: number;
  status: SubscriptionStatus;
  nextDeliveryAt: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionDeliveryDto {
  id: string;
  subscriptionId: string;
  tenantId: string;
  scheduledFor: string;
  deliveredAt: string | null;
  skipped: boolean;
  skipReason: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface SubscriptionStats {
  tenantId: string;
  active: number;
  paused: number;
  cancelled: number;
  /**
   * Monthly Recurring Revenue estimate: for each active sub, unitPrice comes
   * from joined Product, multiplied by quantity, times (1 - discount), times
   * deliveries-per-month factor based on frequency. Computed in SQL — never
   * trust the client (CLAUDE.md #6).
   */
  mrrEstimated: number;
  /** Sum of `savedAmount` for all subscriptions (historical + projected). */
  totalSavedEstimated: number;
  generatedAt: string;
}

// ── Constants / helpers ──────────────────────────────────────────────────────

const FREQUENCY_DAYS: Record<SubscriptionFreq, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
};

/** Entregas por mes (30 dias) — usado para MRR. */
const DELIVERIES_PER_MONTH: Record<SubscriptionFreq, number> = {
  weekly: 30 / 7,
  biweekly: 30 / 14,
  monthly: 1,
  bimonthly: 0.5,
};

const LIST_TTL_SEC = 60;
const STATS_TTL_SEC = 120;

function userCachePrefix(tenantId: string, userId: string): string {
  return `subscriptions:${tenantId}:user:${userId}`;
}

function listUserCacheKey(tenantId: string, userId: string, status?: SubscriptionStatus): string {
  return `${userCachePrefix(tenantId, userId)}:list:${status ?? "all"}`;
}

function statsCacheKey(tenantId: string): string {
  return `subscriptions:${tenantId}:stats`;
}

function deliveriesCacheKey(tenantId: string, subscriptionId: string): string {
  return `subscriptions:${tenantId}:sub:${subscriptionId}:deliveries`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function nextDeliveryFromNow(freq: SubscriptionFreq): Date {
  return addDays(new Date(), FREQUENCY_DAYS[freq]);
}

function subRowToDto(row: {
  id: string;
  tenantId: string;
  userId: string;
  productId: number;
  frequency: SubscriptionFreq;
  quantity: number;
  discount: Prisma.Decimal | number | string;
  status: SubscriptionStatus;
  nextDeliveryAt: Date;
  pausedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SubscriptionDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    productId: row.productId,
    frequency: row.frequency,
    quantity: row.quantity,
    discount: typeof row.discount === "number" ? row.discount : Number(row.discount),
    status: row.status,
    nextDeliveryAt: row.nextDeliveryAt.toISOString(),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function deliveryRowToDto(row: {
  id: string;
  subscriptionId: string;
  tenantId: string;
  scheduledFor: Date;
  deliveredAt: Date | null;
  skipped: boolean;
  skipReason: string | null;
  orderId: string | null;
  createdAt: Date;
}): SubscriptionDeliveryDto {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    tenantId: row.tenantId,
    scheduledFor: row.scheduledFor.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    skipped: row.skipped,
    skipReason: row.skipReason,
    orderId: row.orderId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Load a subscription and assert the tenantId matches the caller. Used by
 * every mutation to avoid cross-tenant writes.
 */
async function loadWithTenantGuard(
  tenantId: string,
  id: string,
): Promise<{
  id: string;
  tenantId: string;
  userId: string;
  productId: number;
  frequency: SubscriptionFreq;
  quantity: number;
  discount: Prisma.Decimal;
  status: SubscriptionStatus;
  nextDeliveryAt: Date;
  pausedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  const sub = await prisma.subscription.findUnique({ where: { id } });
  if (!sub) throw new NotFoundError("Suscripción");
  if (sub.tenantId !== tenantId) throw new SubscriptionCrossTenantError();
  return sub;
}

function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  // Transiciones permitidas:
  //   active   -> paused | cancelled
  //   paused   -> active | cancelled
  //   cancelled -> (terminal, sin salida)
  if (from === to) return true;
  if (from === "cancelled") return false;
  if (to === "cancelled") return true;
  if (from === "active" && to === "paused") return true;
  if (from === "paused" && to === "active") return true;
  return false;
}

// ── SubscriptionsDB ──────────────────────────────────────────────────────────

export const SubscriptionsDB = {
  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * List subscriptions belonging to a given user (Customer.phone) within a
   * tenant, optionally filtered by status. Cached per tenant+user+status.
   */
  async listForUser(
    tenantId: string,
    userId: string,
    options: { status?: SubscriptionStatus } = {},
  ): Promise<SubscriptionDto[]> {
    return getOrSet(
      listUserCacheKey(tenantId, userId, options.status),
      LIST_TTL_SEC,
      async () => {
        const rows = await prisma.subscription.findMany({
          where: {
            tenantId,
            userId,
            ...(options.status ? { status: options.status } : {}),
          },
          orderBy: [{ createdAt: "desc" }],
        });
        return rows.map(subRowToDto);
      },
    ).catch((err) => {
      if (err instanceof ApiError) throw err;
      logger.error("[subscriptions.db] listForUser failed", {
        tenantId,
        userId,
        error: (err as Error).message,
      });
      return [] as SubscriptionDto[];
    });
  },

  /**
   * Active subscriptions whose nextDeliveryAt lands within the next
   * `dayLookAhead` days. Hot path for the delivery-scheduler cron. Uses the
   * index `(tenantId, nextDeliveryAt, status)` — NO table scan.
   */
  async listActiveNearbyDelivery(
    tenantId: string,
    dayLookAhead: number,
  ): Promise<SubscriptionDto[]> {
    const now = new Date();
    const horizon = addDays(now, Math.max(0, Math.trunc(dayLookAhead)));
    const rows = await prisma.subscription.findMany({
      where: {
        tenantId,
        status: "active",
        nextDeliveryAt: { gte: now, lte: horizon },
      },
      orderBy: [{ nextDeliveryAt: "asc" }],
    });
    return rows.map(subRowToDto);
  },

  /**
   * Fetch a single subscription by id, with cross-tenant guard.
   */
  async getById(tenantId: string, id: string): Promise<SubscriptionDto> {
    const row = await loadWithTenantGuard(tenantId, id);
    return subRowToDto(row);
  },

  /**
   * Deliveries for a subscription, newest first. Cached per subscription.
   */
  async listDeliveries(
    tenantId: string,
    subscriptionId: string,
  ): Promise<SubscriptionDeliveryDto[]> {
    return getOrSet(
      deliveriesCacheKey(tenantId, subscriptionId),
      LIST_TTL_SEC,
      async () => {
        // Cross-tenant guard on read — avoid leaking another tenant's deliveries.
        await loadWithTenantGuard(tenantId, subscriptionId);
        const rows = await prisma.subscriptionDelivery.findMany({
          where: { tenantId, subscriptionId },
          orderBy: [{ scheduledFor: "desc" }],
        });
        return rows.map(deliveryRowToDto);
      },
    ).catch((err) => {
      if (err instanceof ApiError) throw err;
      logger.error("[subscriptions.db] listDeliveries failed", {
        tenantId,
        subscriptionId,
        error: (err as Error).message,
      });
      return [] as SubscriptionDeliveryDto[];
    });
  },

  /**
   * Admin KPIs: counts by status + rough MRR estimate.
   *
   * MRR is computed in two passes:
   *   1. SQL groupBy(frequency) with _sum(quantity) for active subs.
   *   2. Join with Product price in a follow-up findMany over the distinct
   *      productIds (tiny result set) and multiply by discount factor.
   *
   * Cached 2 min — invalidated on any write.
   */
  async getStats(tenantId: string): Promise<SubscriptionStats> {
    return getOrSet(
      statsCacheKey(tenantId),
      STATS_TTL_SEC,
      async () => {
        const [active, paused, cancelled, activeRows] = await Promise.all([
          prisma.subscription.count({ where: { tenantId, status: "active" } }),
          prisma.subscription.count({ where: { tenantId, status: "paused" } }),
          prisma.subscription.count({ where: { tenantId, status: "cancelled" } }),
          prisma.subscription.findMany({
            where: { tenantId, status: "active" },
            select: {
              productId: true,
              quantity: true,
              discount: true,
              frequency: true,
            },
          }),
        ]);

        // Resolve product prices in one batch.
        const productIds = Array.from(new Set(activeRows.map((r) => r.productId)));
        const products = productIds.length
          ? await prisma.product.findMany({
              where: { id: { in: productIds } },
              select: { id: true, price: true, tenantId: true },
            })
          : [];
        const priceByProduct = new Map<number, number>();
        for (const p of products) {
          // Defensive: only include same-tenant products. Cross-tenant rows would be
          // a bug but the Map skip keeps the math safe.
          if (p.tenantId !== tenantId) continue;
          priceByProduct.set(p.id, Number(p.price));
        }

        let mrr = 0;
        let savedEstimated = 0;
        for (const row of activeRows) {
          const price = priceByProduct.get(row.productId) ?? 0;
          const discountFactor = Number(row.discount);
          const monthDeliveries = DELIVERIES_PER_MONTH[row.frequency];
          const grossMonthly = price * row.quantity * monthDeliveries;
          mrr += grossMonthly * (1 - discountFactor);
          savedEstimated += grossMonthly * discountFactor * 12; // projected yearly savings
        }

        return {
          tenantId,
          active,
          paused,
          cancelled,
          mrrEstimated: Math.round(mrr * 100) / 100,
          totalSavedEstimated: Math.round(savedEstimated * 100) / 100,
          generatedAt: new Date().toISOString(),
        };
      },
    );
  },

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Create a new subscription for a customer. `userId` is the caller's
   * Customer.phone — we don't validate its existence physically (no FK) but
   * we do attach `tenantId` so the row is correctly isolated.
   */
  async create(
    tenantId: string,
    data: CreateSubscriptionInput,
  ): Promise<SubscriptionDto> {
    const parsed = CreateSubscriptionInput.safeParse(data);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid subscription input",
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      );
    }

    const input = parsed.data;
    const created = await prisma.subscription.create({
      data: {
        tenantId,
        userId: input.userId,
        productId: input.productId,
        frequency: input.frequency,
        quantity: input.quantity,
        discount: input.discount,
        status: "active",
        nextDeliveryAt: nextDeliveryFromNow(input.frequency),
      },
    });

    invalidateByPrefix(userCachePrefix(tenantId, input.userId));
    invalidate(statsCacheKey(tenantId));

    logActivity(
      "subscription_create",
      "Subscription",
      `producto=${input.productId} freq=${input.frequency} qty=${input.quantity}`,
      created.id,
      "customer",
      undefined,
      tenantId,
    ).catch((err) => {
      logger.warn("[subscriptions.db] activity log failed", {
        error: String(err),
      });
    });

    return subRowToDto(created);
  },

  /**
   * Pause / resume / cancel a subscription. Sets the corresponding timestamp
   * (pausedAt or cancelledAt) and keeps the other timestamps intact. When
   * resuming from pause, `pausedAt` is cleared and `nextDeliveryAt` is
   * recomputed relative to "now" so the next delivery isn't in the past.
   */
  async updateStatus(
    tenantId: string,
    id: string,
    data: UpdateStatusInput,
  ): Promise<SubscriptionDto> {
    const parsed = UpdateStatusInput.safeParse(data);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid status input",
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      );
    }

    const sub = await loadWithTenantGuard(tenantId, id);
    const { status: newStatus, cancelReason } = parsed.data;

    if (!canTransition(sub.status, newStatus)) {
      throw new SubscriptionInvalidStatusError(sub.status, newStatus);
    }

    const patch: Prisma.SubscriptionUpdateInput = { status: newStatus };
    const now = new Date();
    if (newStatus === "paused") {
      patch.pausedAt = now;
    } else if (newStatus === "active" && sub.status === "paused") {
      patch.pausedAt = null;
      patch.nextDeliveryAt = nextDeliveryFromNow(sub.frequency);
    } else if (newStatus === "cancelled") {
      patch.cancelledAt = now;
      if (cancelReason) patch.cancelReason = cancelReason;
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: patch,
    });

    invalidateByPrefix(userCachePrefix(tenantId, sub.userId));
    invalidate(statsCacheKey(tenantId));

    logActivity(
      "subscription_status",
      "Subscription",
      `${sub.status} -> ${newStatus}${cancelReason ? ` (${cancelReason})` : ""}`,
      id,
      "customer",
      undefined,
      tenantId,
    ).catch((err) => {
      logger.warn("[subscriptions.db] activity log failed", {
        error: String(err),
      });
    });

    return subRowToDto(updated);
  },

  /**
   * Change the frequency (weekly/biweekly/monthly/bimonthly). Recalculates
   * `nextDeliveryAt` to "now + new frequency days" so the user gets a
   * deterministic next date instead of drifting from the old schedule.
   */
  async changeFrequency(
    tenantId: string,
    id: string,
    data: ChangeFrequencyInput,
  ): Promise<SubscriptionDto> {
    const parsed = ChangeFrequencyInput.safeParse(data);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid frequency input",
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      );
    }

    const sub = await loadWithTenantGuard(tenantId, id);
    if (sub.status === "cancelled") {
      throw new SubscriptionInvalidStatusError("cancelled", "active");
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        frequency: parsed.data.frequency,
        nextDeliveryAt: nextDeliveryFromNow(parsed.data.frequency),
      },
    });

    invalidateByPrefix(userCachePrefix(tenantId, sub.userId));
    invalidate(statsCacheKey(tenantId));

    logActivity(
      "subscription_frequency",
      "Subscription",
      `${sub.frequency} -> ${parsed.data.frequency}`,
      id,
      "customer",
      undefined,
      tenantId,
    ).catch((err) => {
      logger.warn("[subscriptions.db] activity log failed", {
        error: String(err),
      });
    });

    return subRowToDto(updated);
  },

  /**
   * Skip the next scheduled delivery. Creates a SubscriptionDelivery row with
   * `skipped: true` for the current `nextDeliveryAt`, then advances
   * `nextDeliveryAt` by one cycle. Both writes happen inside one transaction.
   */
  async skipNextDelivery(
    tenantId: string,
    id: string,
    skipReason?: string,
  ): Promise<SubscriptionDto> {
    const sub = await loadWithTenantGuard(tenantId, id);
    if (sub.status !== "active") {
      throw new SubscriptionInvalidStatusError(sub.status, "active");
    }

    const newNext = addDays(sub.nextDeliveryAt, FREQUENCY_DAYS[sub.frequency]);

    const [, updated] = await prisma.$transaction([
      prisma.subscriptionDelivery.create({
        data: {
          tenantId,
          subscriptionId: id,
          scheduledFor: sub.nextDeliveryAt,
          skipped: true,
          skipReason: skipReason ?? null,
        },
      }),
      prisma.subscription.update({
        where: { id },
        data: { nextDeliveryAt: newNext },
      }),
    ]);

    invalidateByPrefix(userCachePrefix(tenantId, sub.userId));
    invalidate(deliveriesCacheKey(tenantId, id));
    invalidate(statsCacheKey(tenantId));

    logActivity(
      "subscription_skip",
      "Subscription",
      `skip ${sub.nextDeliveryAt.toISOString()}${skipReason ? ` (${skipReason})` : ""}`,
      id,
      "customer",
      undefined,
      tenantId,
    ).catch((err) => {
      logger.warn("[subscriptions.db] activity log failed", {
        error: String(err),
      });
    });

    return subRowToDto(updated);
  },
};

export type SubscriptionsDBType = typeof SubscriptionsDB;
