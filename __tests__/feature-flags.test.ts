/**
 * __tests__/feature-flags.test.ts
 *
 * Unit tests for lib/feature-flags.ts
 * Covers: isFeatureEnabled (env var override / default fallback),
 * getAllFlags (all flags with current values), logFeatureFlags.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock logger before importing the module ─────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  isFeatureEnabled,
  getAllFlags,
  logFeatureFlags,
} from "@/lib/feature-flags";

import { logger } from "@/lib/logger";

// ── isFeatureEnabled ────────────────────────────────────────────────────────

describe("isFeatureEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default true for bullmq-queues when no env var set", () => {
    const result = isFeatureEnabled("bullmq-queues");
    expect(result).toBe(true);
  });

  it("returns default true for refresh-tokens when no env var set", () => {
    const result = isFeatureEnabled("refresh-tokens");
    expect(result).toBe(true);
  });

  it("returns default false for rolling-releases when no env var set", () => {
    const result = isFeatureEnabled("rolling-releases");
    expect(result).toBe(false);
  });

  it("returns default false for redis-cache when no env var set", () => {
    const result = isFeatureEnabled("redis-cache");
    expect(result).toBe(false);
  });

  it("returns default true for whatsapp-bot when no env var set", () => {
    const result = isFeatureEnabled("whatsapp-bot");
    expect(result).toBe(true);
  });

  it("returns default true for push-notifications when no env var set", () => {
    const result = isFeatureEnabled("push-notifications");
    expect(result).toBe(true);
  });

  it("env var 'true' overrides default false", () => {
    process.env.FEATURE_ROLLING_RELEASES = "true";
    const result = isFeatureEnabled("rolling-releases");
    expect(result).toBe(true);
  });

  it("env var '1' overrides default false", () => {
    process.env.FEATURE_REDIS_CACHE = "1";
    const result = isFeatureEnabled("redis-cache");
    expect(result).toBe(true);
  });

  it("env var 'false' overrides default true", () => {
    process.env.FEATURE_BULLMQ_QUEUES = "false";
    const result = isFeatureEnabled("bullmq-queues");
    expect(result).toBe(false);
  });

  it("env var '0' overrides default true to false", () => {
    process.env.FEATURE_WHATSAPP_BOT = "0";
    const result = isFeatureEnabled("whatsapp-bot");
    expect(result).toBe(false);
  });

  it("accepts optional tenantId parameter without error", () => {
    const result = isFeatureEnabled("bullmq-queues", "main");
    expect(result).toBe(true);
  });
});

// ── getAllFlags ──────────────────────────────────────────────────────────────

describe("getAllFlags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("incluye las 12 flags originales (backward compat)", () => {
    const flags = getAllFlags();
    // Las 12 flags que existían antes de los bloques D1/D2/D3 del marketplace.
    // Agregar nuevas flags NO debe romper este test — solo garantizamos que
    // las originales siguen exportándose.
    const baselineKeys = [
      "bullmq-queues", "refresh-tokens", "rolling-releases",
      "redis-cache", "oauth-google", "cursor-pagination",
      "ai-assistant-v2", "marketplace-v2", "whatsapp-bot",
      "push-notifications",
      "whatsapp-order-notifications", "auto-coupon-triggers",
    ];
    for (const key of baselineKeys) {
      expect(key in flags).toBe(true);
    }
    expect(Object.keys(flags).length).toBeGreaterThanOrEqual(
      baselineKeys.length
    );
  });

  it("returns defaults when no env vars set", () => {
    const flags = getAllFlags();
    expect(flags["bullmq-queues"]).toBe(true);
    expect(flags["refresh-tokens"]).toBe(true);
    expect(flags["rolling-releases"]).toBe(false);
    expect(flags["redis-cache"]).toBe(false);
    // Brandon 2026-05-17: oauth-google default cambió a true (GA noviembre 2025).
    expect(flags["oauth-google"]).toBe(true);
    expect(flags["cursor-pagination"]).toBe(false);
    expect(flags["ai-assistant-v2"]).toBe(false);
    expect(flags["marketplace-v2"]).toBe(false);
    expect(flags["whatsapp-bot"]).toBe(true);
    expect(flags["push-notifications"]).toBe(true);
    expect(flags["whatsapp-order-notifications"]).toBe(true);
    expect(flags["auto-coupon-triggers"]).toBe(true);
  });

  it("reflects env var overrides", () => {
    process.env.FEATURE_ROLLING_RELEASES = "true";
    process.env.FEATURE_BULLMQ_QUEUES = "false";
    const flags = getAllFlags();
    expect(flags["rolling-releases"]).toBe(true);
    expect(flags["bullmq-queues"]).toBe(false);
  });

  it("accepts optional tenantId parameter", () => {
    const flags = getAllFlags("demo");
    // No hardcodeamos el count — solo que el resultado tenga al menos las
    // 12 flags baseline.
    expect(Object.keys(flags).length).toBeGreaterThanOrEqual(12);
  });
});

// ── logFeatureFlags ─────────────────────────────────────────────────────────

describe("logFeatureFlags", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls logger.info with all flags", () => {
    logFeatureFlags();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      "[feature-flags] Current state",
      expect.objectContaining({ flags: expect.any(Object) }),
    );
  });

  it("passes tenantId to getAllFlags", () => {
    logFeatureFlags("main");
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
