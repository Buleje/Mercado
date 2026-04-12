import "server-only";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #68 — AI cost control circuit breaker
 *
 * Tracks AI spend per tenant in-memory (per-instance) and trips the breaker
 * when a tenant exceeds its monthly hard cap. While open, further AI calls
 * should short-circuit to a cheap fallback (cached last response, rule-based,
 * or a polite error) instead of hitting the provider.
 *
 * Not a full replacement for the Vercel AI Gateway budget alerts — this is a
 * per-replica fast path so we never bill customers past their plan.
 */

export type BreakerState = "closed" | "open" | "half-open";

interface TenantBucket {
  tokensUsedThisMonth: number;
  capTokens: number;
  state: BreakerState;
  lastResetAt: number;
  lastTrippedAt: number;
}

const DEFAULT_TOKEN_CAP_PER_TENANT = 500_000;
const HALF_OPEN_COOLDOWN_MS = 10 * 60 * 1000;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const buckets = new Map<string, TenantBucket>();

function ensureBucket(tenantId: string, capTokens: number): TenantBucket {
  const now = Date.now();
  const current = buckets.get(tenantId);
  if (current) {
    if (now - current.lastResetAt > 30 * MS_IN_DAY) {
      current.tokensUsedThisMonth = 0;
      current.state = "closed";
      current.lastResetAt = now;
    }
    return current;
  }
  const fresh: TenantBucket = {
    tokensUsedThisMonth: 0,
    capTokens,
    state: "closed",
    lastResetAt: now,
    lastTrippedAt: 0,
  };
  buckets.set(tenantId, fresh);
  return fresh;
}

export function canCallAi(tenantId: string, capTokens = DEFAULT_TOKEN_CAP_PER_TENANT): boolean {
  const b = ensureBucket(tenantId, capTokens);
  if (b.state === "closed") return true;
  if (b.state === "open") {
    if (Date.now() - b.lastTrippedAt > HALF_OPEN_COOLDOWN_MS) {
      b.state = "half-open";
      return true;
    }
    return false;
  }
  return true;
}

export function reportAiUsage(tenantId: string, tokensUsed: number): void {
  const b = ensureBucket(tenantId, DEFAULT_TOKEN_CAP_PER_TENANT);
  b.tokensUsedThisMonth += Math.max(0, tokensUsed);
  if (b.tokensUsedThisMonth > b.capTokens) {
    if (b.state !== "open") {
      logger.warn("[ai-circuit-breaker] tripped", {
        tenantId,
        tokensUsedThisMonth: b.tokensUsedThisMonth,
        cap: b.capTokens,
      });
    }
    b.state = "open";
    b.lastTrippedAt = Date.now();
  } else if (b.state === "half-open") {
    b.state = "closed";
  }
}

export function getBreakerSnapshot(tenantId: string): TenantBucket | null {
  return buckets.get(tenantId) ?? null;
}

export function resetBreaker(tenantId: string): void {
  buckets.delete(tenantId);
}
