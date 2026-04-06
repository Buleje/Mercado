/**
 * __tests__/ab-testing.test.ts
 *
 * Unit tests for the deterministic assignVariant logic in lib/ab-testing.ts.
 * DB methods are mocked — only pure functions are tested here.
 */

import { describe, it, expect, vi } from "vitest";

// ── Mock Prisma (DB not needed for assignVariant) ─────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aBTest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    aBTestEvent: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { ABTestDB } from "@/lib/ab-testing";
import type { ABTestDef } from "@/lib/ab-testing";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTest(variantWeights: number[]): ABTestDef {
  return {
    id: "test-001",
    name: "Banner prueba",
    description: "Prueba de banner",
    active: true,
    createdAt: new Date().toISOString(),
    variants: variantWeights.map((w, i) => ({
      id: `variant-${i}`,
      label: `Variante ${i}`,
      weight: w,
    })),
  };
}

// ── assignVariant — determinism ───────────────────────────────────────────────

describe("ABTestDB.assignVariant — determinism", () => {
  it("returns the same variant for the same visitor and test on every call", () => {
    const test = makeTest([50, 50]);
    const v1 = ABTestDB.assignVariant(test, "visitor-abc");
    const v2 = ABTestDB.assignVariant(test, "visitor-abc");
    expect(v1.id).toBe(v2.id);
  });

  it("may return different variants for different visitors", () => {
    const test = makeTest([50, 50]);
    // Use enough unique visitor IDs to statistically guarantee both variants appear
    const visitorIds = Array.from({ length: 100 }, (_, i) => `visitor-${i}-xjq`);
    const results = new Set(visitorIds.map((id) => ABTestDB.assignVariant(test, id).id));
    // With 100 visitors and 50/50 weight, probability of all in one bucket is 2^(-99) ≈ 0
    expect(results.size).toBeGreaterThan(1);
  });

  it("always returns a variant that exists in the test", () => {
    const test = makeTest([30, 40, 30]);
    for (let i = 0; i < 20; i++) {
      const v = ABTestDB.assignVariant(test, `visitor-${i}`);
      expect(test.variants.map(x => x.id)).toContain(v.id);
    }
  });
});

// ── assignVariant — weight distribution ──────────────────────────────────────

describe("ABTestDB.assignVariant — weighted distribution", () => {
  it("returns the only variant when there is one with weight 100", () => {
    const test = makeTest([100]);
    const v = ABTestDB.assignVariant(test, "any-visitor");
    expect(v.id).toBe("variant-0");
  });

  it("falls back to first variant when weight calculation produces edge case", () => {
    // This tests the final fallback return
    const test = makeTest([1]);
    const v = ABTestDB.assignVariant(test, "visitor");
    expect(v).toBeDefined();
    expect(v.id).toBe("variant-0");
  });

  it("handles extremely unequal weights (99 vs 1) without crashing", () => {
    const test = makeTest([99, 1]);
    for (let i = 0; i < 30; i++) {
      const v = ABTestDB.assignVariant(test, `u-${i}`);
      expect(["variant-0", "variant-1"]).toContain(v.id);
    }
  });
});

// ── assignVariant — result structure ─────────────────────────────────────────

describe("ABTestDB.assignVariant — result structure", () => {
  it("returned variant has id, label, and weight fields", () => {
    const test = makeTest([50, 50]);
    const v = ABTestDB.assignVariant(test, "visitor-x");
    expect(v).toHaveProperty("id");
    expect(v).toHaveProperty("label");
    expect(v).toHaveProperty("weight");
  });

  it("different testId + same visitorId produces potentially different result", () => {
    const testA = { ...makeTest([50, 50]), id: "test-A" };
    const testB = { ...makeTest([50, 50]), id: "test-B" };
    // May or may not differ — just ensure no crash
    const vA = ABTestDB.assignVariant(testA, "same-visitor");
    const vB = ABTestDB.assignVariant(testB, "same-visitor");
    expect(vA).toBeDefined();
    expect(vB).toBeDefined();
  });
});
