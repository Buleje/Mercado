import "server-only";
/**
 * lib/db/socio-buleje.db.ts — Prisma-backed DB class para Socio Buleje.
 *
 * ADR-078 canónica. Reemplaza el mock in-memory.
 *
 * Tres tablas Prisma:
 *   - SocioMembership       (mutable — contrato vivo)
 *   - SocioBillingCycle     (mutable status — ciclo de cobro)
 *   - SocioCashbackEntry    (APPEND-ONLY — ledger del saldo cashback)
 *
 * CLAUDE.md compliance:
 *   #1 — ningún caller toca prisma.socio* directamente; todo pasa por acá.
 *   #3 — `tenantId` es el PRIMER parámetro en todas las funciones públicas.
 *   #5 — invalidateByPrefix(`socio:${tenantId}:${userId}`) después de writes.
 *   #6 — balances y snapshots se computan server-side.
 *   #7 — activity log / analytics son fire-and-forget.
 *
 * Ledger invariants:
 *   - Nunca UPDATE/DELETE sobre SocioCashbackEntry.
 *   - Correcciones = nueva entry con type="adjustment".
 *   - `balanceAfter` se computa en transacción: previous + amount.
 *   - Redeem usa SELECT FOR UPDATE sobre membership para prevenir race.
 */

import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import {
  ApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import {
  MOCK_EXCLUSIVE_OFFERS,
  type MockExclusiveOffer,
} from "@/lib/mocks/socio-buleje.mock";
import type {
  BillingCycleStatus,
  ISocioBulejeDB,
  SocioAdminStats,
  SocioBillingCycleRow,
  SocioCashbackEntryRow,
  SocioExclusiveOffer,
  SocioMembershipRow,
  SocioMembershipWithBalance,
  SocioPlan as SocioPlanCanonical,
  SocioStatus,
} from "@/lib/db/interfaces/ISocioBulejeDB";
import {
  SOCIO_CASHBACK_PCT,
  SOCIO_GRACE_PERIOD_DAYS,
  SOCIO_PLAN_PRICES,
  SOCIO_TRIAL_DAYS,
} from "@/lib/db/interfaces/ISocioBulejeDB";
import {
  canonicalPlan,
  type SocioPlan as SocioPlanInput,
} from "@/lib/validators/socio-buleje";

// ── Errors ────────────────────────────────────────────────────────────────────

export class SocioMembershipNotFoundError extends NotFoundError {
  constructor() {
    super("Membership de Socio Buleje");
  }
}

export class SocioInsufficientBalanceError extends ApiError {
  constructor(balance: number, requested: number) {
    super(
      "SOCIO_INSUFFICIENT_BALANCE",
      `Saldo Socio insuficiente: tenés S/${balance.toFixed(2)}, pedís S/${requested.toFixed(2)}`,
      409,
      { balance, requested },
    );
  }
}

export class SocioInactiveError extends ApiError {
  constructor(status: SocioStatus) {
    super(
      "SOCIO_INACTIVE",
      `La membership está en estado "${status}" — no se puede aplicar cashback`,
      409,
      { status },
    );
  }
}

// ── Constantes internas ───────────────────────────────────────────────────────

const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 100;
const CACHE_TTL_SEC = 60;

function cachePrefix(tenantId: string, userId: string): string {
  return `socio:${tenantId}:${userId}`;
}
function membershipCacheKey(tenantId: string, userId: string): string {
  return `${cachePrefix(tenantId, userId)}:membership`;
}
function historyCacheKey(tenantId: string, userId: string, limit: number): string {
  return `${cachePrefix(tenantId, userId)}:history:${limit}`;
}
function balanceCacheKey(tenantId: string, userId: string): string {
  return `${cachePrefix(tenantId, userId)}:balance`;
}
function offersCacheKey(tenantId: string, limit: number): string {
  return `socio:${tenantId}:offers:${limit}`;
}
function statsCacheKey(tenantId: string): string {
  return `socio:${tenantId}:stats`;
}

// ── Mappers (Prisma row → DTO) ───────────────────────────────────────────────

type PrismaMembership = {
  id: string;
  tenantId: string;
  userId: string;
  plan: "monthly" | "annual";
  status: "trial" | "active" | "past_due" | "paused" | "cancelled";
  startedAt: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaBillingCycle = {
  id: string;
  membershipId: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  amountSoles: unknown; // Prisma Decimal
  status: "pending" | "paid" | "failed" | "waived";
  paidAt: Date | null;
  invoiceId: string | null;
  failureReason: string | null;
  createdAt: Date;
};

type PrismaCashbackEntry = {
  id: string;
  membershipId: string;
  tenantId: string;
  userId: string;
  orderId: string | null;
  type: "earned" | "redeemed" | "expired" | "bonus" | "adjustment";
  amountSoles: unknown;
  description: string;
  balanceAfter: unknown;
  createdAt: Date;
};

function decimalToNumber(d: unknown): number {
  if (typeof d === "number") return d;
  if (typeof d === "string") return Number.parseFloat(d);
  if (d && typeof d === "object" && "toNumber" in d) {
    const n = (d as { toNumber(): number }).toNumber();
    return n;
  }
  if (d && typeof d === "object" && "toString" in d) {
    return Number.parseFloat(String(d));
  }
  return 0;
}

function toMembershipRow(m: PrismaMembership): SocioMembershipRow {
  return {
    id: m.id,
    tenantId: m.tenantId,
    userId: m.userId,
    plan: m.plan,
    status: m.status,
    startedAt: m.startedAt.toISOString(),
    currentPeriodEnd: m.currentPeriodEnd.toISOString(),
    trialEndsAt: m.trialEndsAt ? m.trialEndsAt.toISOString() : null,
    cancelledAt: m.cancelledAt ? m.cancelledAt.toISOString() : null,
    cancelReason: m.cancelReason,
    cancelAtPeriodEnd: m.cancelAtPeriodEnd,
    autoRenew: m.autoRenew,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function toCycleRow(c: PrismaBillingCycle): SocioBillingCycleRow {
  return {
    id: c.id,
    membershipId: c.membershipId,
    tenantId: c.tenantId,
    periodStart: c.periodStart.toISOString(),
    periodEnd: c.periodEnd.toISOString(),
    amountSoles: decimalToNumber(c.amountSoles),
    status: c.status,
    paidAt: c.paidAt ? c.paidAt.toISOString() : null,
    invoiceId: c.invoiceId,
    failureReason: c.failureReason,
    createdAt: c.createdAt.toISOString(),
  };
}

function toEntryRow(e: PrismaCashbackEntry): SocioCashbackEntryRow {
  return {
    id: e.id,
    membershipId: e.membershipId,
    tenantId: e.tenantId,
    userId: e.userId,
    orderId: e.orderId,
    type: e.type,
    amountSoles: decimalToNumber(e.amountSoles),
    description: e.description,
    balanceAfter: decimalToNumber(e.balanceAfter),
    createdAt: e.createdAt.toISOString(),
  };
}

// ── Helpers de dominio ────────────────────────────────────────────────────────

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function planDurationDays(plan: SocioPlanCanonical): number {
  return plan === "annual" ? 365 : 30;
}

/** Precio del plan en soles — fuente única de verdad. */
function planPriceSoles(plan: SocioPlanCanonical): number {
  return SOCIO_PLAN_PRICES[plan];
}

async function hydrateWithBalance(
  membership: PrismaMembership,
): Promise<SocioMembershipWithBalance> {
  // Último snapshot de balance + agregados earned/redeemed.
  const [latest, agg] = await Promise.all([
    (prisma as unknown as {
      socioCashbackEntry: {
        findFirst(args: {
          where: { tenantId: string; userId: string };
          orderBy: Array<{ createdAt: "desc" | "asc" }> | { createdAt: "desc" | "asc" };
          select: { balanceAfter: true };
        }): Promise<{ balanceAfter: unknown } | null>;
      };
    }).socioCashbackEntry.findFirst({
      where: { tenantId: membership.tenantId, userId: membership.userId },
      orderBy: [{ createdAt: "desc" }],
      select: { balanceAfter: true },
    }),
    (prisma as unknown as {
      socioCashbackEntry: {
        groupBy(args: {
          by: ["type"];
          where: { tenantId: string; userId: string };
          _sum: { amountSoles: true };
        }): Promise<Array<{ type: string; _sum: { amountSoles: unknown } }>>;
      };
    }).socioCashbackEntry.groupBy({
      by: ["type"],
      where: { tenantId: membership.tenantId, userId: membership.userId },
      _sum: { amountSoles: true },
    }),
  ]);

  let totalEarned = 0;
  let totalRedeemed = 0;
  for (const g of agg) {
    const sum = decimalToNumber(g._sum.amountSoles);
    if (g.type === "earned" || g.type === "bonus") totalEarned += sum;
    if (g.type === "redeemed" || g.type === "expired") totalRedeemed += Math.abs(sum);
  }

  return {
    ...toMembershipRow(membership),
    cashbackBalance: latest ? decimalToNumber(latest.balanceAfter) : 0,
    totalEarned: Number(totalEarned.toFixed(2)),
    totalRedeemed: Number(totalRedeemed.toFixed(2)),
  };
}

// ── Public DB class ───────────────────────────────────────────────────────────

// Typed accessors a prisma (el client se genera en lib/generated/prisma).
// Usamos un cast angosto para evitar `any` global.
type SocioPrismaClient = {
  socioMembership: {
    findUnique(args: {
      where: { tenantId_userId: { tenantId: string; userId: string } };
    }): Promise<PrismaMembership | null>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: unknown;
      select?: unknown;
    }): Promise<PrismaMembership | null>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
      skip?: number;
    }): Promise<PrismaMembership[]>;
    create(args: { data: Record<string, unknown> }): Promise<PrismaMembership>;
    update(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<PrismaMembership>;
    count(args?: { where?: Record<string, unknown> }): Promise<number>;
    groupBy(args: {
      by: ["status"];
      where: { tenantId: string };
      _count: { _all: true };
    }): Promise<Array<{ status: SocioStatus; _count: { _all: number } }>>;
  };
  socioBillingCycle: {
    create(args: { data: Record<string, unknown> }): Promise<PrismaBillingCycle>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: unknown;
    }): Promise<PrismaBillingCycle | null>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
    }): Promise<PrismaBillingCycle[]>;
    aggregate(args: {
      where: Record<string, unknown>;
      _sum: { amountSoles: true };
    }): Promise<{ _sum: { amountSoles: unknown } }>;
    groupBy(args: {
      by: ["status"];
      where: Record<string, unknown>;
      _count: { _all: true };
    }): Promise<Array<{ status: BillingCycleStatus; _count: { _all: number } }>>;
  };
  socioCashbackEntry: {
    create(args: { data: Record<string, unknown> }): Promise<PrismaCashbackEntry>;
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: unknown;
      select?: unknown;
    }): Promise<(PrismaCashbackEntry | { balanceAfter: unknown }) | null>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
    }): Promise<PrismaCashbackEntry[]>;
  };
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $transaction<T>(fn: (tx: SocioPrismaClient) => Promise<T>): Promise<T>;
};

const pdb = prisma as unknown as SocioPrismaClient;

export const SocioBulejeDB: ISocioBulejeDB = {
  async getMembership(
    tenantId: string,
    userId: string,
  ): Promise<SocioMembershipWithBalance | null> {
    return getOrSet(membershipCacheKey(tenantId, userId), CACHE_TTL_SEC, async () => {
      const membership = await pdb.socioMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
      });
      if (!membership) return null;
      return hydrateWithBalance(membership);
    });
  },

  async subscribe(
    tenantId: string,
    userId: string,
    plan: SocioPlanInput,
  ): Promise<SocioMembershipWithBalance> {
    const canonical = canonicalPlan(plan);
    const now = new Date();

    // ¿Existe una membership anterior? Para decidir si da trial o no.
    const existing = await pdb.socioMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    const isFirstTimeEver = !existing;
    const startedAt = existing?.startedAt ?? now;
    const trialEndsAt = isFirstTimeEver ? addDays(now, SOCIO_TRIAL_DAYS) : null;
    const duration = planDurationDays(canonical);
    const currentPeriodEnd = isFirstTimeEver
      ? addDays(now, SOCIO_TRIAL_DAYS)
      : addDays(now, duration);
    const status: SocioStatus = isFirstTimeEver ? "trial" : "active";

    const priceSoles = planPriceSoles(canonical);

    // Transacción: upsert membership + primer billing cycle.
    const { membership, cycle } = await pdb.$transaction(async (tx) => {
      let next: PrismaMembership;
      if (existing) {
        next = await tx.socioMembership.update({
          where: { tenantId_userId: { tenantId, userId } },
          data: {
            plan: canonical,
            status: "active",
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            cancelReason: null,
            autoRenew: true,
          },
        });
      } else {
        next = await tx.socioMembership.create({
          data: {
            tenantId,
            userId,
            plan: canonical,
            status,
            startedAt,
            currentPeriodEnd,
            trialEndsAt,
            cancelAtPeriodEnd: false,
            autoRenew: true,
          },
        });
      }

      const newCycle = await tx.socioBillingCycle.create({
        data: {
          membershipId: next.id,
          tenantId,
          periodStart: now,
          periodEnd: currentPeriodEnd,
          amountSoles: isFirstTimeEver ? 0 : priceSoles,
          status: isFirstTimeEver ? "waived" : "pending",
          paidAt: null,
        },
      });

      return { membership: next, cycle: newCycle };
    });

    invalidateByPrefix(cachePrefix(tenantId, userId));
    invalidateByPrefix(`socio:${tenantId}:stats`);

    logActivity(
      "socio_subscribe",
      "SocioMembership",
      `Plan ${canonical} activado (cycle ${cycle.id}, ${cycle.status})`,
      membership.id,
      "system",
      undefined,
      tenantId,
    ).catch((err) => logger.warn("[socio] activity log failed", { error: String(err) }));

    return hydrateWithBalance(membership);
  },

  async cancel(
    tenantId: string,
    userId: string,
    reason?: string,
    immediate: boolean = false,
  ): Promise<SocioMembershipWithBalance | null> {
    const existing = await pdb.socioMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!existing) return null;

    const now = new Date();
    const updated = await pdb.socioMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: immediate
        ? {
            status: "cancelled",
            cancelledAt: now,
            cancelReason: reason ?? null,
            cancelAtPeriodEnd: false,
            autoRenew: false,
          }
        : {
            cancelAtPeriodEnd: true,
            cancelReason: reason ?? null,
            autoRenew: false,
          },
    });

    invalidateByPrefix(cachePrefix(tenantId, userId));
    invalidateByPrefix(`socio:${tenantId}:stats`);

    logActivity(
      immediate ? "socio_cancel_immediate" : "socio_cancel_at_period_end",
      "SocioMembership",
      reason ?? "(sin razón)",
      updated.id,
      "system",
      undefined,
      tenantId,
    ).catch((err) => logger.warn("[socio] activity log failed", { error: String(err) }));

    return hydrateWithBalance(updated);
  },

  async resume(
    tenantId: string,
    userId: string,
  ): Promise<SocioMembershipWithBalance | null> {
    const existing = await pdb.socioMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!existing) return null;

    if (existing.status === "cancelled") {
      // No se puede "resume" una cancelada inmediata — re-subscribe.
      throw new ConflictError(
        "Membership ya cancelada definitivamente. Suscribite de nuevo.",
      );
    }

    const updated = await pdb.socioMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: {
        cancelAtPeriodEnd: false,
        autoRenew: true,
        cancelReason: null,
      },
    });

    invalidateByPrefix(cachePrefix(tenantId, userId));
    invalidateByPrefix(`socio:${tenantId}:stats`);

    logActivity(
      "socio_resume",
      "SocioMembership",
      "Resume (no cancelar al fin del periodo)",
      updated.id,
      "system",
      undefined,
      tenantId,
    ).catch((err) => logger.warn("[socio] activity log failed", { error: String(err) }));

    return hydrateWithBalance(updated);
  },

  async earnCashback(
    tenantId: string,
    userId: string,
    orderId: string | null,
    amountSoles: number,
    description: string,
  ): Promise<SocioCashbackEntryRow> {
    if (!Number.isFinite(amountSoles) || amountSoles <= 0) {
      throw new ValidationError("amountSoles debe ser > 0");
    }
    if (!description.trim()) {
      throw new ValidationError("description requerido");
    }

    const amountRounded = Number(amountSoles.toFixed(2));

    const entry = await pdb.$transaction(async (tx) => {
      const membership = await tx.socioMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
      });
      if (!membership) throw new SocioMembershipNotFoundError();
      // past_due permite earn, pero no redeem (regla ADR-078).
      if (membership.status === "cancelled" || membership.status === "paused") {
        throw new SocioInactiveError(membership.status);
      }

      const last = await tx.socioCashbackEntry.findFirst({
        where: { tenantId, userId },
        orderBy: [{ createdAt: "desc" }],
        select: { balanceAfter: true },
      });
      const previous = last ? decimalToNumber(last.balanceAfter) : 0;
      const newBalance = Number((previous + amountRounded).toFixed(2));

      const created = (await tx.socioCashbackEntry.create({
        data: {
          membershipId: membership.id,
          tenantId,
          userId,
          orderId,
          type: "earned",
          amountSoles: amountRounded,
          description,
          balanceAfter: newBalance,
        },
      })) as PrismaCashbackEntry;

      return created;
    });

    invalidateByPrefix(cachePrefix(tenantId, userId));

    logActivity(
      "socio_cashback_earn",
      "SocioCashbackEntry",
      `+S/${amountRounded.toFixed(2)} (${description})`,
      entry.id,
      "system",
      undefined,
      tenantId,
    ).catch((err) => logger.warn("[socio] activity log failed", { error: String(err) }));

    return toEntryRow(entry);
  },

  async redeemCashback(
    tenantId: string,
    userId: string,
    orderId: string | null,
    amountSoles: number,
  ): Promise<SocioCashbackEntryRow> {
    if (!Number.isFinite(amountSoles) || amountSoles <= 0) {
      throw new ValidationError("amountSoles debe ser > 0");
    }
    const amountRounded = Number(amountSoles.toFixed(2));

    const entry = await pdb.$transaction(async (tx) => {
      // Lock de membership (SELECT FOR UPDATE) para evitar race en redeem concurrente.
      const locked = await tx.$queryRaw<Array<{ id: string; status: SocioStatus }>>`
        SELECT "id", "status"
        FROM "socio_memberships"
        WHERE "tenantId" = ${tenantId} AND "userId" = ${userId}
        FOR UPDATE
      `;
      const lockedRow = locked[0];
      if (!lockedRow) throw new SocioMembershipNotFoundError();

      // past_due / paused / cancelled no pueden redeem.
      if (lockedRow.status !== "active" && lockedRow.status !== "trial") {
        throw new SocioInactiveError(lockedRow.status);
      }

      const last = await tx.socioCashbackEntry.findFirst({
        where: { tenantId, userId },
        orderBy: [{ createdAt: "desc" }],
        select: { balanceAfter: true },
      });
      const previous = last ? decimalToNumber(last.balanceAfter) : 0;
      if (previous < amountRounded) {
        throw new SocioInsufficientBalanceError(previous, amountRounded);
      }
      const newBalance = Number((previous - amountRounded).toFixed(2));

      const created = (await tx.socioCashbackEntry.create({
        data: {
          membershipId: lockedRow.id,
          tenantId,
          userId,
          orderId,
          type: "redeemed",
          amountSoles: -amountRounded, // negativo por convención
          description: orderId
            ? `Canje en orden ${orderId}`
            : `Canje manual`,
          balanceAfter: newBalance,
        },
      })) as PrismaCashbackEntry;

      return created;
    });

    invalidateByPrefix(cachePrefix(tenantId, userId));

    logActivity(
      "socio_cashback_redeem",
      "SocioCashbackEntry",
      `-S/${amountRounded.toFixed(2)} (order ${orderId ?? "manual"})`,
      entry.id,
      "system",
      undefined,
      tenantId,
    ).catch((err) => logger.warn("[socio] activity log failed", { error: String(err) }));

    return toEntryRow(entry);
  },

  async getCashbackHistory(
    tenantId: string,
    userId: string,
    limit: number = HISTORY_DEFAULT_LIMIT,
  ): Promise<SocioCashbackEntryRow[]> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), HISTORY_MAX_LIMIT);
    return getOrSet(
      historyCacheKey(tenantId, userId, safeLimit),
      CACHE_TTL_SEC,
      async () => {
        const rows = (await pdb.socioCashbackEntry.findMany({
          where: { tenantId, userId },
          orderBy: [{ createdAt: "desc" }],
          take: safeLimit,
        })) as PrismaCashbackEntry[];
        return rows.map(toEntryRow);
      },
    );
  },

  async getCashbackBalance(tenantId: string, userId: string): Promise<number> {
    return getOrSet(balanceCacheKey(tenantId, userId), CACHE_TTL_SEC, async () => {
      const last = (await pdb.socioCashbackEntry.findFirst({
        where: { tenantId, userId },
        orderBy: [{ createdAt: "desc" }],
        select: { balanceAfter: true },
      })) as { balanceAfter: unknown } | null;
      return last ? decimalToNumber(last.balanceAfter) : 0;
    });
  },

  async getExclusiveOffers(
    tenantId: string,
    limit: number = 12,
  ): Promise<SocioExclusiveOffer[]> {
    // V1: mock de ofertas. Sprint B conectará con Product.socioPrice.
    return getOrSet(offersCacheKey(tenantId, limit), CACHE_TTL_SEC * 5, async () => {
      return MOCK_EXCLUSIVE_OFFERS.slice(0, limit).map(
        (m: MockExclusiveOffer): SocioExclusiveOffer => ({
          productId: m.productId,
          name: m.name,
          image: m.image,
          category: m.category,
          regularPrice: m.regularPrice,
          socioPrice: m.socioPrice,
          unit: m.unit,
          storeName: m.storeName,
        }),
      );
    });
  },

  async getStats(tenantId: string): Promise<SocioAdminStats> {
    return getOrSet(statsCacheKey(tenantId), CACHE_TTL_SEC, async () => {
      const now = new Date();
      const monthAgo = addDays(now, -30);

      // Counts por status.
      const byStatus = await pdb.socioMembership.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { _all: true },
      });
      const counts: Record<SocioStatus, number> = {
        trial: 0,
        active: 0,
        past_due: 0,
        paused: 0,
        cancelled: 0,
      };
      for (const g of byStatus) counts[g.status] += g._count._all;

      const totalMembers =
        counts.trial + counts.active + counts.past_due + counts.paused + counts.cancelled;
      const activeMembers = counts.trial + counts.active;

      // MRR: suma de cycles `paid` con periodEnd dentro del último mes.
      const mrrAgg = await pdb.socioBillingCycle.aggregate({
        where: {
          tenantId,
          status: "paid",
          periodEnd: { gte: monthAgo },
        },
        _sum: { amountSoles: true },
      });
      const mrrSoles = decimalToNumber(mrrAgg._sum.amountSoles);

      // Churn: (cancelled ultimos 30d) / (activos hace 30d + cancelados ultimos 30d)
      const cancelledRecent = await pdb.socioMembership.count({
        where: { tenantId, status: "cancelled", cancelledAt: { gte: monthAgo } },
      });
      const baseChurn = counts.active + counts.trial + cancelledRecent;
      const churnRate30d = baseChurn > 0 ? cancelledRecent / baseChurn : 0;

      // Outstanding liability: sumar el último balanceAfter por user (app-level dedupe).
      const raw = await pdb.$queryRaw<Array<{ total: string | null }>>`
        SELECT COALESCE(SUM(latest."balanceAfter"), 0)::text AS total
        FROM (
          SELECT DISTINCT ON ("userId") "balanceAfter"
          FROM "socio_cashback_entries"
          WHERE "tenantId" = ${tenantId}
          ORDER BY "userId", "createdAt" DESC
        ) AS latest
      `;
      const liability = decimalToNumber(raw[0]?.total ?? 0);
      const avgBalance = activeMembers > 0 ? liability / activeMembers : 0;

      // Cycle success rate (ultimos 30d).
      const cycleGroups = await pdb.socioBillingCycle.groupBy({
        by: ["status"],
        where: { tenantId, createdAt: { gte: monthAgo } },
        _count: { _all: true },
      });
      const cycleCounts: Record<BillingCycleStatus, number> = {
        pending: 0,
        paid: 0,
        failed: 0,
        waived: 0,
      };
      for (const g of cycleGroups) cycleCounts[g.status] += g._count._all;
      const cycleDenom = cycleCounts.paid + cycleCounts.failed;
      const lastCycleSuccessRate = cycleDenom > 0 ? cycleCounts.paid / cycleDenom : 1;

      return {
        tenantId,
        totalMembers,
        activeMembers,
        trialMembers: counts.trial,
        pastDueMembers: counts.past_due,
        cancelledMembers: counts.cancelled,
        mrrSoles: Number(mrrSoles.toFixed(2)),
        churnRate30d: Number(churnRate30d.toFixed(4)),
        avgCashbackBalanceSoles: Number(avgBalance.toFixed(2)),
        outstandingCashbackLiabilitySoles: Number(liability.toFixed(2)),
        lastCycleSuccessRate: Number(lastCycleSuccessRate.toFixed(4)),
      };
    });
  },

  async renewCycleIfDue(
    tenantId: string,
    membershipId: string,
  ): Promise<SocioBillingCycleRow | null> {
    // Idempotente: corre por membership y solo crea cycle nuevo si aplica.
    const membership = await pdb.socioMembership.findFirst({
      where: { id: membershipId, tenantId },
    });
    if (!membership) return null;

    // No renovar si está cancelada / paused / pidió no renovar.
    if (
      membership.status === "cancelled" ||
      membership.status === "paused" ||
      membership.cancelAtPeriodEnd ||
      !membership.autoRenew
    ) {
      return null;
    }

    const now = new Date();
    const threshold = addDays(now, 1); // crear si periodEnd < now + 1d

    if (membership.currentPeriodEnd > threshold) {
      // Aún no le toca renovar.
      return null;
    }

    // ¿Ya existe un cycle pending para el próximo periodo? Idempotencia.
    const nextPeriodStart = membership.currentPeriodEnd;
    const nextPeriodEnd = addDays(nextPeriodStart, planDurationDays(membership.plan));
    const alreadyQueued = await pdb.socioBillingCycle.findFirst({
      where: {
        tenantId,
        membershipId: membership.id,
        periodStart: { gte: nextPeriodStart },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    if (alreadyQueued) return toCycleRow(alreadyQueued);

    const priceSoles = planPriceSoles(membership.plan);

    const created = await pdb.$transaction(async (tx) => {
      const cycle = await tx.socioBillingCycle.create({
        data: {
          membershipId: membership.id,
          tenantId,
          periodStart: nextPeriodStart,
          periodEnd: nextPeriodEnd,
          amountSoles: priceSoles,
          status: "pending",
        },
      });

      // Mover el periodo vigente de la membership.
      await tx.socioMembership.update({
        where: { tenantId_userId: { tenantId, userId: membership.userId } },
        data: { currentPeriodEnd: nextPeriodEnd, status: "active" },
      });

      return cycle;
    });

    invalidateByPrefix(cachePrefix(tenantId, membership.userId));
    invalidateByPrefix(`socio:${tenantId}:stats`);

    logActivity(
      "socio_cycle_renewed",
      "SocioBillingCycle",
      `Próximo ciclo ${created.id} hasta ${nextPeriodEnd.toISOString()}`,
      created.id,
      "system",
      undefined,
      tenantId,
    ).catch((err) => logger.warn("[socio] activity log failed", { error: String(err) }));

    return toCycleRow(created);
  },

  async listMembers(
    tenantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ members: SocioMembershipWithBalance[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 200);
    const safeOffset = Math.max(0, Math.trunc(offset));

    const [rows, total] = await Promise.all([
      pdb.socioMembership.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: "desc" }],
        take: safeLimit,
        skip: safeOffset,
      }),
      pdb.socioMembership.count({ where: { tenantId } }),
    ]);

    const members = await Promise.all(rows.map(hydrateWithBalance));
    return { members, total };
  },
};

// ── Re-exports para API routes ────────────────────────────────────────────────
export type {
  SocioCashbackEntryRow,
  SocioMembershipRow,
  SocioMembershipWithBalance,
  SocioExclusiveOffer,
  SocioAdminStats,
} from "@/lib/db/interfaces/ISocioBulejeDB";

export { SOCIO_CASHBACK_PCT, SOCIO_PLAN_PRICES, SOCIO_TRIAL_DAYS, SOCIO_GRACE_PERIOD_DAYS };

// Para retrocompatibilidad con el mock.
export function getPlanPrice(plan: SocioPlanInput): number {
  return planPriceSoles(canonicalPlan(plan));
}

// Logger dev-only para diagnosticar unused warnings.
if (process.env.NODE_ENV === "development") {
  logger.debug("[socio-buleje.db] loaded Prisma-backed DB class (ADR-078)");
}
