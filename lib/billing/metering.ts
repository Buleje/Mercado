import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const METERED_EVENTS = [
  "order.created",
  "ai.call",
  "ai.recommend",
  "ai.insight",
  "sms.sent",
  "whatsapp.sent",
  "sunat.emitted",
  "storage.blob",
] as const;
export type MeteredEvent = (typeof METERED_EVENTS)[number];

export type MeteredRecord = {
  tenantId: string;
  event: MeteredEvent;
  amount: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

const MAX_AMOUNT = 10_000;
const IDEMPOTENCY_WINDOW_MINUTES = 60;

/**
 * Record a billable usage event. Piggybacks on `ActivityLog` so we do not need
 * a new Prisma model — events are stored with `entity = "usage.meter"` and
 * `action = <MeteredEvent>`. The numeric amount + metadata live inside
 * `detail` as JSON so the row is still auditable.
 *
 * Idempotency: if an `idempotencyKey` is provided, the same key within the
 * last IDEMPOTENCY_WINDOW_MINUTES minutes is a no-op (returns false).
 */
export async function recordUsageEvent(r: MeteredRecord): Promise<boolean> {
  if (!r.tenantId) return false;
  if (!Number.isFinite(r.amount) || r.amount <= 0 || r.amount > MAX_AMOUNT) {
    logger.warn("[metering] invalid amount", { tenantId: r.tenantId, amount: r.amount });
    return false;
  }

  if (r.idempotencyKey) {
    const cutoff = new Date(Date.now() - IDEMPOTENCY_WINDOW_MINUTES * 60_000);
    try {
      const existing = await prisma.activityLog.findFirst({
        where: {
          tenantId: r.tenantId,
          entity: "usage.meter",
          entityId: r.idempotencyKey,
          createdAt: { gte: cutoff },
        },
        select: { id: true },
      });
      if (existing) return false;
    } catch (err) {
      logger.warn("[metering] idempotency lookup failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const detail = JSON.stringify({
    amount: r.amount,
    metadata: r.metadata ?? {},
    recordedAt: new Date().toISOString(),
  });

  try {
    await prisma.activityLog.create({
      data: {
        tenantId: r.tenantId,
        entity: "usage.meter",
        entityId: r.idempotencyKey ?? null,
        action: r.event,
        detail,
        user: "system",
      },
    });
    return true;
  } catch (err) {
    logger.error("[metering] persist failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export type UsagePeriod = { from: Date; to: Date };

/**
 * Aggregate metered usage for a tenant over a time window. Returns a map
 * from event name to the sum of amounts. Unknown events are ignored.
 */
export async function getMeteredUsage(
  tenantId: string,
  period: UsagePeriod,
): Promise<Record<MeteredEvent, number>> {
  const empty = Object.fromEntries(
    METERED_EVENTS.map((e) => [e, 0]),
  ) as Record<MeteredEvent, number>;

  if (!tenantId) return empty;

  try {
    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: "usage.meter",
        createdAt: { gte: period.from, lte: period.to },
      },
      select: { action: true, detail: true },
    });

    for (const row of rows) {
      if (!METERED_EVENTS.includes(row.action as MeteredEvent)) continue;
      try {
        const parsed = JSON.parse(row.detail) as { amount?: unknown };
        const amount = typeof parsed.amount === "number" ? parsed.amount : 0;
        empty[row.action as MeteredEvent] += amount;
      } catch {
        // corrupt row — skip
      }
    }
    return empty;
  } catch (err) {
    logger.error("[metering] aggregate failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

/** Convenience helper: returns the current billing month as a UsagePeriod. */
export function currentBillingMonth(now = new Date()): UsagePeriod {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}
