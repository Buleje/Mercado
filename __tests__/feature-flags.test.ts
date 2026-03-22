/**
 * __tests__/feature-flags.test.ts
 *
 * Unit tests for lib/feature-flags.ts
 * Covers: isFeatureEnabled (stored value / default fallback),
 * getFeatureFlags (merged with defaults), setFeatureFlag.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma before importing the module ───────────────────────────────────

const { mockSettingsFindUnique, mockSettingsUpsert } = vi.hoisted(() => ({
  mockSettingsFindUnique: vi.fn(),
  mockSettingsUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    settings: {
      findUnique: mockSettingsFindUnique,
      upsert: mockSettingsUpsert,
    },
  },
}));

import {
  isFeatureEnabled,
  getFeatureFlags,
  setFeatureFlag,
} from "@/lib/feature-flags";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSettings(flags: Record<string, boolean>) {
  return { featureFlagsJson: JSON.stringify(flags) };
}

// ── isFeatureEnabled ──────────────────────────────────────────────────────────

describe("isFeatureEnabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns stored value (true) when flag is explicitly enabled", async () => {
    mockSettingsFindUnique.mockResolvedValue(makeSettings({ push_notifications: true }));
    const result = await isFeatureEnabled("main", "push_notifications");
    expect(result).toBe(true);
  });

  it("returns stored value (false) when flag is explicitly disabled", async () => {
    mockSettingsFindUnique.mockResolvedValue(makeSettings({ loyalty_coupons: false }));
    const result = await isFeatureEnabled("main", "loyalty_coupons");
    expect(result).toBe(false);
  });

  it("returns default (true) for loyalty_coupons when no settings row", async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    const result = await isFeatureEnabled("main", "loyalty_coupons");
    expect(result).toBe(true); // default = true
  });

  it("returns default (false) for push_notifications when no settings row", async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    const result = await isFeatureEnabled("main", "push_notifications");
    expect(result).toBe(false); // default = false
  });

  it("returns default when featureFlagsJson is null", async () => {
    mockSettingsFindUnique.mockResolvedValue({ featureFlagsJson: null });
    const result = await isFeatureEnabled("main", "advanced_search");
    expect(result).toBe(true); // default = true
  });

  it("returns default when featureFlagsJson is malformed JSON", async () => {
    mockSettingsFindUnique.mockResolvedValue({ featureFlagsJson: "not-json{{" });
    const result = await isFeatureEnabled("main", "combo_manager");
    expect(result).toBe(true); // default = true
  });
});

// ── getFeatureFlags ───────────────────────────────────────────────────────────

describe("getFeatureFlags", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all flags with defaults when no settings", async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    const flags = await getFeatureFlags("main");
    expect(flags.loyalty_coupons).toBe(true);
    expect(flags.push_notifications).toBe(false);
    expect(flags.advanced_search).toBe(true);
    expect(flags.ai_suggestions).toBe(false);
  });

  it("overrides defaults with stored values", async () => {
    mockSettingsFindUnique.mockResolvedValue(
      makeSettings({ push_notifications: true, loyalty_coupons: false })
    );
    const flags = await getFeatureFlags("main");
    expect(flags.push_notifications).toBe(true);
    expect(flags.loyalty_coupons).toBe(false);
  });

  it("returns an object with all known flag keys", async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    const flags = await getFeatureFlags("main");
    const expectedKeys = [
      "loyalty_coupons", "push_notifications", "advanced_search",
      "ai_suggestions", "combo_manager", "customer_portal",
      "demand_prediction", "whatsapp_integration", "back_in_stock_alerts",
      "product_comparisons", "exit_intent_modal", "abandoned_cart_recovery",
    ];
    for (const key of expectedKeys) {
      expect(key in flags).toBe(true);
    }
  });

  it("ignores unknown flag keys from stored JSON", async () => {
    mockSettingsFindUnique.mockResolvedValue(
      makeSettings({ unknown_flag: true } as Record<string, boolean>)
    );
    const flags = await getFeatureFlags("main");
    expect("unknown_flag" in flags).toBe(false);
  });
});

// ── setFeatureFlag ────────────────────────────────────────────────────────────

describe("setFeatureFlag", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls prisma.settings.upsert with updated flags JSON", async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    mockSettingsUpsert.mockResolvedValue({});

    await setFeatureFlag("main", "push_notifications", true);

    expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    const call = mockSettingsUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: "main" });
    const updatedJson = JSON.parse(call.update.featureFlagsJson);
    expect(updatedJson.push_notifications).toBe(true);
  });

  it("persists false correctly", async () => {
    mockSettingsFindUnique.mockResolvedValue(makeSettings({ loyalty_coupons: true }));
    mockSettingsUpsert.mockResolvedValue({});

    await setFeatureFlag("main", "loyalty_coupons", false);

    const call = mockSettingsUpsert.mock.calls[0][0];
    const updatedJson = JSON.parse(call.update.featureFlagsJson);
    expect(updatedJson.loyalty_coupons).toBe(false);
  });
});
