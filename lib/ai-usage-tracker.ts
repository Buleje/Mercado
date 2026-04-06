import "server-only";

/**
 * lib/ai-usage-tracker.ts
 *
 * Tracks token usage per tenant per month and enforces limits.
 * Uses in-memory tracking (resets on server restart) + ActivityLog for persistence.
 *
 * Like a budget for your AI assistant — each question costs "tokens" (tiny units),
 * and this makes sure nobody uses too many in one month.
 */

import { logger } from "@/lib/logger";

// ── Config ────────────────────────────────────────────────────────────────────

/** Default monthly token limit per tenant (500k tokens ≈ ~1,600 queries) */
const DEFAULT_MONTHLY_LIMIT = 500_000;

/** Warn when usage reaches this % of the limit */
const WARNING_THRESHOLD = 0.8; // 80%

// ── In-memory store ───────────────────────────────────────────────────────────

interface UsageRecord {
  tokens: number;
  requests: number;
  monthKey: string; // "2026-04"
  lastWarning?: number; // timestamp of last warning
}

const usageByTenant = new Map<string, UsageRecord>();

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getOrCreateRecord(tenantId: string): UsageRecord {
  const key = currentMonthKey();
  const existing = usageByTenant.get(tenantId);

  // Reset if month changed
  if (existing && existing.monthKey === key) {
    return existing;
  }

  const record: UsageRecord = { tokens: 0, requests: 0, monthKey: key };
  usageByTenant.set(tenantId, record);
  return record;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface UsageCheckResult {
  allowed: boolean;
  currentTokens: number;
  limit: number;
  percentUsed: number;
  remainingTokens: number;
  warning?: string;
}

/**
 * Check if a tenant can make another AI request.
 * Call BEFORE sending the request to Groq.
 */
export function checkTokenBudget(tenantId: string, limit = DEFAULT_MONTHLY_LIMIT): UsageCheckResult {
  const record = getOrCreateRecord(tenantId);
  const percentUsed = record.tokens / limit;
  const remaining = Math.max(limit - record.tokens, 0);

  if (record.tokens >= limit) {
    return {
      allowed: false,
      currentTokens: record.tokens,
      limit,
      percentUsed: Math.round(percentUsed * 100),
      remainingTokens: 0,
      warning: `Límite mensual de IA alcanzado (${record.tokens.toLocaleString()} / ${limit.toLocaleString()} tokens). Se reinicia el próximo mes.`,
    };
  }

  let warning: string | undefined;
  if (percentUsed >= WARNING_THRESHOLD) {
    warning = `Llevas ${Math.round(percentUsed * 100)}% del límite mensual de IA (${record.tokens.toLocaleString()} / ${limit.toLocaleString()} tokens).`;
  }

  return {
    allowed: true,
    currentTokens: record.tokens,
    limit,
    percentUsed: Math.round(percentUsed * 100),
    remainingTokens: remaining,
    warning,
  };
}

/**
 * Record tokens used after a successful AI call.
 * Call AFTER receiving the response from Groq.
 */
export function recordTokenUsage(tenantId: string, tokensUsed: number): void {
  const record = getOrCreateRecord(tenantId);
  record.tokens += tokensUsed;
  record.requests += 1;

  if (tokensUsed > 0) {
    logger.info("[ai-usage] Tokens recorded", {
      tenantId,
      tokensUsed,
      totalMonth: record.tokens,
      requests: record.requests,
    });
  }
}

/**
 * Get usage summary for a tenant (for dashboard display).
 */
export function getUsageSummary(tenantId: string, limit = DEFAULT_MONTHLY_LIMIT) {
  const record = getOrCreateRecord(tenantId);
  return {
    monthKey: record.monthKey,
    tokensUsed: record.tokens,
    requestCount: record.requests,
    limit,
    percentUsed: Math.round((record.tokens / limit) * 100),
    remaining: Math.max(limit - record.tokens, 0),
  };
}
