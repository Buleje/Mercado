import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { ApiError, NotFoundError } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  ILoyaltyDB,
  LoyaltyHistoryPage,
  LoyaltyReason,
  LoyaltyTransactionRow,
} from "@/lib/db/interfaces/ILoyaltyDB";

/**
 * lib/db/loyalty.db.ts — TD-030 / ADR-024
 *
 * Append-only ledger writer for `Customer.loyaltyPoints`. Every mutation goes
 * through `addTransaction(...)`, which uses `prisma.$transaction([...])` so the
 * row insert and the materialized balance update commit atomically.
 *
 * CLAUDE.md compliance:
 *   #1 — never bypass this class to touch Customer.loyaltyPoints
 *   #3 — tenantId is the FIRST parameter on every public method
 *   #5 — invalidateByPrefix(`loyalty:${tenantId}:${customerId}`) after every write
 *   #6 — caller never recomputes the balance; this class is the source of truth
 *   #7 — activity log is fire-and-forget with `.catch(() => {})`
 */

// ── Error types ──────────────────────────────────────────────────────────────

export class LoyaltyInvalidAmountError extends ApiError {
  constructor(amount: number) {
    super(
      "LOYALTY_INVALID_AMOUNT",
      `Loyalty transaction amount must be a non-zero integer (got ${amount})`,
      400,
      { amount },
    );
  }
}

export class LoyaltyInsufficientBalanceError extends ApiError {
  constructor(balance: number, requested: number) {
    super(
      "LOYALTY_INSUFFICIENT_BALANCE",
      `Insufficient loyalty balance: have ${balance}, need ${requested}`,
      409,
      { balance, requested },
    );
  }
}

export class LoyaltyCrossTenantError extends ApiError {
  constructor() {
    super(
      "LOYALTY_CROSS_TENANT",
      "Customer belongs to a different tenant",
      403,
    );
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 100;
const HISTORY_TTL_SEC = 60;

function cachePrefix(tenantId: string, customerId: string): string {
  return `loyalty:${tenantId}:${customerId}`;
}

function historyCacheKey(
  tenantId: string,
  customerId: string,
  limit: number,
  offset: number,
): string {
  return `${cachePrefix(tenantId, customerId)}:history:${limit}:${offset}`;
}

function balanceCacheKey(tenantId: string, customerId: string): string {
  return `${cachePrefix(tenantId, customerId)}:balance`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata !== "object") return null;
  return metadata as Record<string, unknown>;
}

function rowToDto(row: {
  id: string;
  customerId: string;
  tenantId: string;
  amount: number;
  reason: string;
  metadata: unknown;
  createdAt: Date;
}): LoyaltyTransactionRow {
  return {
    id: row.id,
    customerId: row.customerId,
    tenantId: row.tenantId,
    amount: row.amount,
    reason: row.reason,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Internal write path. Validates amount sign + tenant ownership, then runs the
 * insert + increment inside a single Prisma transaction.
 *
 * `signedAmount` is the canonical signed integer that lands in the row.
 */
async function writeTransaction(
  tenantId: string,
  customerId: string,
  signedAmount: number,
  reason: string,
  metadata: Record<string, unknown> | undefined,
): Promise<LoyaltyTransactionRow> {
  if (!Number.isInteger(signedAmount) || signedAmount === 0) {
    throw new LoyaltyInvalidAmountError(signedAmount);
  }

  // Cross-tenant guard. We do NOT trust the request — we look the customer up
  // ourselves and refuse the write if its tenantId !== caller's tenantId.
  const customer = await prisma.customer.findUnique({
    where: { phone: customerId },
    select: { phone: true, tenantId: true, loyaltyPoints: true },
  });
  if (!customer) {
    throw new NotFoundError("Cliente");
  }
  if (customer.tenantId !== tenantId) {
    throw new LoyaltyCrossTenantError();
  }

  // Reject debits that would push the balance negative.
  if (signedAmount < 0 && customer.loyaltyPoints + signedAmount < 0) {
    throw new LoyaltyInsufficientBalanceError(customer.loyaltyPoints, -signedAmount);
  }

  const normalizedMetadata = normalizeMetadata(metadata);

  // SECURITY 2026-05-06 (pentest H003 — CRITICAL): redeem race condition.
  // Antes el check de saldo (línea 148) corría FUERA del lock — dos requests
  // paralelos con balance=100 y debit=-100 ambos pasaban el check, ambos
  // ejecutaban increment y dejaban balance=-100. Ahora el `updateMany` con
  // guard `loyaltyPoints + signedAmount >= 0` falla atómicamente la 2da.
  const updateResult = await prisma.$transaction(async (tx) => {
    const ledger = await tx.loyaltyTransaction.create({
      data: {
        customerId,
        tenantId,
        amount: signedAmount,
        reason,
        metadata: (normalizedMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    if (signedAmount < 0) {
      // Debit con guard atómico: solo descuenta si hay saldo suficiente.
       
      const updated = await tx.$executeRawUnsafe(
        `UPDATE "Customer"
            SET "loyaltyPoints" = "loyaltyPoints" + $1
          WHERE phone = $2 AND "tenantId" = $3
            AND "loyaltyPoints" + $1 >= 0`,
        signedAmount,
        customerId,
        tenantId,
      );
      if (updated === 0) {
        throw new LoyaltyInsufficientBalanceError(customer.loyaltyPoints, -signedAmount);
      }
    } else {
      await tx.customer.update({
        where: { phone: customerId },
        data: { loyaltyPoints: { increment: signedAmount } },
      });
    }
    return [ledger];
  });
  const [created] = updateResult;

  // CLAUDE.md #5 — evict every cached page for this customer.
  invalidateByPrefix(cachePrefix(tenantId, customerId));

  // CLAUDE.md #7 — fire-and-forget activity log.
  logActivity(
    signedAmount > 0 ? "loyalty_earn" : "loyalty_redeem",
    "Customer",
    `${signedAmount > 0 ? "+" : ""}${signedAmount} pts (${reason})`,
    customerId,
    "system",
    undefined,
    tenantId,
  ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  return rowToDto({
    id: created.id,
    customerId: created.customerId,
    tenantId: created.tenantId,
    amount: created.amount,
    reason: created.reason,
    metadata: created.metadata,
    createdAt: created.createdAt,
  });
}

// ── LoyaltyDB ────────────────────────────────────────────────────────────────

export const LoyaltyDB: ILoyaltyDB = {
  async earn(
    tenantId: string,
    customerId: string,
    amount: number,
    reason: LoyaltyReason | string,
    metadata?: Record<string, unknown>,
  ): Promise<LoyaltyTransactionRow> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new LoyaltyInvalidAmountError(amount);
    }
    return writeTransaction(tenantId, customerId, amount, reason, metadata);
  },

  async redeem(
    tenantId: string,
    customerId: string,
    amount: number,
    reason: LoyaltyReason | string,
    metadata?: Record<string, unknown>,
  ): Promise<LoyaltyTransactionRow> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new LoyaltyInvalidAmountError(amount);
    }
    return writeTransaction(tenantId, customerId, -amount, reason, metadata);
  },

  async getHistory(
    tenantId: string,
    customerId: string,
    limit = HISTORY_DEFAULT_LIMIT,
    offset = 0,
  ): Promise<LoyaltyHistoryPage> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), HISTORY_MAX_LIMIT);
    const safeOffset = Math.max(0, Math.trunc(offset));

    return getOrSet(
      historyCacheKey(tenantId, customerId, safeLimit, safeOffset),
      HISTORY_TTL_SEC,
      async () => {
        // Cross-tenant guard on read too — never leak another tenant's history.
        const customer = await prisma.customer.findUnique({
          where: { phone: customerId },
          select: { phone: true, tenantId: true, loyaltyPoints: true },
        });
        if (!customer) {
          return { transactions: [], balance: 0, total: 0 };
        }
        if (customer.tenantId !== tenantId) {
          throw new LoyaltyCrossTenantError();
        }

        const [rows, total] = await prisma.$transaction([
          prisma.loyaltyTransaction.findMany({
            where: { tenantId, customerId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: safeLimit,
            skip: safeOffset,
          }),
          prisma.loyaltyTransaction.count({
            where: { tenantId, customerId },
          }),
        ]);

        return {
          transactions: rows.map((r) =>
            rowToDto({
              id: r.id,
              customerId: r.customerId,
              tenantId: r.tenantId,
              amount: r.amount,
              reason: r.reason,
              metadata: r.metadata,
              createdAt: r.createdAt,
            }),
          ),
          balance: customer.loyaltyPoints,
          total,
        };
      },
    ).catch((err) => {
      // ApiError (cross-tenant, etc.) bubbles up so the route can map it.
      if (err instanceof ApiError) throw err;
      logger.error("[loyalty.db] getHistory failed", {
        tenantId,
        customerId,
        error: (err as Error).message,
      });
      return { transactions: [], balance: 0, total: 0 };
    });
  },

  async getBalance(tenantId: string, customerId: string): Promise<number> {
    return getOrSet(
      balanceCacheKey(tenantId, customerId),
      HISTORY_TTL_SEC,
      async () => {
        const customer = await prisma.customer.findUnique({
          where: { phone: customerId },
          select: { tenantId: true, loyaltyPoints: true },
        });
        if (!customer) return 0;
        if (customer.tenantId !== tenantId) {
          throw new LoyaltyCrossTenantError();
        }
        return customer.loyaltyPoints;
      },
    );
  },
};
