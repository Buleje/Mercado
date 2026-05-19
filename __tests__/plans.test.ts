/**
 * __tests__/plans.test.ts
 *
 * Unit tests for lib/plans.ts — PLANS config, getPlanLimits, getPlanDef,
 * withinLimit, planLimitPayload.
 */

import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  getPlanLimits,
  getPlanDef,
  withinLimit,
  planLimitPayload,
} from "@/lib/plans";

// ── PLANS catalog ─────────────────────────────────────────────────────────────

describe("PLANS — catalog integrity", () => {
  it("contains all four plan IDs", () => {
    expect(Object.keys(PLANS)).toEqual(expect.arrayContaining(["free", "pro", "business", "enterprise"]));
  });

  it("PLAN_ORDER has exactly 4 entries in ascending tier", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro", "business", "enterprise"]);
  });

  it("free plan has priceMonthly = 0", () => {
    expect(PLANS.free.priceMonthly).toBe(0);
  });

  it("free plan limits maxProducts to 50", () => {
    expect(PLANS.free.limits.maxProducts).toBe(50);
  });

  it("business plan has unlimited products (-1)", () => {
    expect(PLANS.business.limits.maxProducts).toBe(-1);
  });

  it("enterprise plan has unlimited orders (-1)", () => {
    expect(PLANS.enterprise.limits.maxOrdersPerMonth).toBe(-1);
  });

  it("business plan is marked as popular (badge 'Más elegido')", () => {
    // Brandon 2026-05-17: post-migración planes 2026-05-11 el "Más elegido"
    // pasó de 'pro' (S/49) a 'business' (S/179). 'pro' ahora se llama "Starter"
    // y business muestra label "Pro". El 60% del mercado va a business.
    expect(PLANS.business.popular).toBe(true);
    expect(PLANS.pro.popular).toBe(false);
  });

  it("enterprise plan has sla = true", () => {
    expect(PLANS.enterprise.limits.sla).toBe(true);
  });

  it("free plan has apiAccess = false", () => {
    expect(PLANS.free.limits.apiAccess).toBe(false);
  });
});

// ── getPlanLimits ─────────────────────────────────────────────────────────────

describe("getPlanLimits", () => {
  it("returns correct limits for 'free'", () => {
    const limits = getPlanLimits("free");
    expect(limits.maxProducts).toBe(50);
    expect(limits.maxOrdersPerMonth).toBe(200);
  });

  it("returns correct limits for 'pro'", () => {
    const limits = getPlanLimits("pro");
    expect(limits.maxProducts).toBe(500);
    expect(limits.advancedAnalytics).toBe(true);
  });

  it("returns correct limits for 'business'", () => {
    const limits = getPlanLimits("business");
    expect(limits.maxProducts).toBe(-1);
    expect(limits.multiStore).toBe(true);
  });

  it("falls back to 'free' for unknown plan ID", () => {
    const limits = getPlanLimits("unknown-plan");
    expect(limits.maxProducts).toBe(50);
  });

  it("falls back to 'free' for empty string", () => {
    const limits = getPlanLimits("");
    expect(limits.maxProducts).toBe(50);
  });
});

// ── getPlanDef ────────────────────────────────────────────────────────────────

describe("getPlanDef", () => {
  it("returns 'pro' plan def with correct name", () => {
    // Brandon 2026-05-17: id "pro" ahora muestra name "Starter" (rebranding planes).
    const def = getPlanDef("pro");
    expect(def.name).toBe("Starter");
    expect(def.id).toBe("pro");
  });

  it("falls back to 'free' for unknown plan", () => {
    const def = getPlanDef("nonexistent");
    expect(def.id).toBe("free");
  });

  it("enterprise has non-zero priceMonthly", () => {
    const def = getPlanDef("enterprise");
    expect(def.priceMonthly).toBeGreaterThan(0);
  });
});

// ── withinLimit ───────────────────────────────────────────────────────────────

describe("withinLimit", () => {
  it("returns true when -1 (unlimited) regardless of current usage", () => {
    expect(withinLimit(99999, -1)).toBe(true);
  });

  it("returns true when current < max", () => {
    expect(withinLimit(49, 50)).toBe(true);
  });

  it("returns false when current === max (limit reached)", () => {
    expect(withinLimit(50, 50)).toBe(false);
  });

  it("returns false when current > max", () => {
    expect(withinLimit(51, 50)).toBe(false);
  });

  it("returns true at current = 0 with any positive max", () => {
    expect(withinLimit(0, 1)).toBe(true);
  });
});

// ── planLimitPayload ──────────────────────────────────────────────────────────

describe("planLimitPayload", () => {
  it("returns object with upgrade = true", () => {
    const payload = planLimitPayload("productos", 50, 50, "free");
    expect(payload.upgrade).toBe(true);
  });

  it("includes resource, current, max and plan fields", () => {
    const payload = planLimitPayload("pedidos", 200, 200, "free");
    expect(payload.resource).toBe("pedidos");
    expect(payload.current).toBe(200);
    expect(payload.max).toBe(200);
    expect(payload.plan).toBe("free");
  });

  it("includes a non-empty error string", () => {
    const payload = planLimitPayload("usuarios", 2, 2, "free");
    expect(typeof payload.error).toBe("string");
    expect(payload.error.length).toBeGreaterThan(0);
  });

  it("detail string mentions the plan name", () => {
    const payload = planLimitPayload("productos", 50, 50, "pro");
    expect(payload.detail).toContain("Starter");
  });
});
